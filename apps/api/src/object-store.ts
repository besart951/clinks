import {
	DeleteObjectCommand,
	GetBucketCorsCommand,
	GetBucketVersioningCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import type { StorageProblem } from '@clinks/domain/storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import type { Agent } from 'node:https';
import { ApiError } from './errors.ts';

export interface ObjectStoreOptions {
	bucket: string;
	endpoint: string | undefined;
	region: string;
	/** Path-style URLs (`endpoint/bucket/key`); Infomaniak and RustFS need them. Default true. */
	pathStyle?: boolean;
	/** A tenant's own keys; without them the SDK reads the API's AWS_* environment. */
	credentials?: { accessKeyId: string; secretAccessKey: string };
	/** Connection pool for HTTPS; tenants' buckets get one that refuses internal addresses on connect. */
	httpsAgent?: Agent;
}

const probeKey = '_clinks/connection-check';

export class ObjectStore {
	readonly client: S3Client;
	readonly bucket: string;

	constructor(options: ObjectStoreOptions) {
		this.bucket = options.bucket;
		this.client = new S3Client({
			endpoint: options.endpoint,
			region: options.region,
			forcePathStyle: options.pathStyle ?? true,
			credentials: options.credentials,
			requestChecksumCalculation: 'WHEN_REQUIRED',
			maxAttempts: 2,
			...(options.httpsAgent && { requestHandler: { httpsAgent: options.httpsAgent } }),
		});
	}

	/**
	 * Checks what documents need from a bucket: reachable with these keys, versioning on, an object can be
	 * written and read back, and the browser origin may upload (CORS). The probe object is overwritten each time.
	 */
	async check(webOrigin: string): Promise<StorageProblem[]> {
		const status = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
		try {
			await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
		} catch (error) {
			const code = status(error);
			return [code === 403 || code === 401 ? 'credentials' : code === 404 ? 'bucket' : 'unreachable'];
		}
		const problems: StorageProblem[] = [];
		const versioning = await this.client
			.send(new GetBucketVersioningCommand({ Bucket: this.bucket }))
			.catch(() => null);
		if (versioning?.Status !== 'Enabled') problems.push('versioning');
		try {
			const body = Buffer.from(`CLinks ${new Date().toISOString()}`);
			await this.client.send(
				new PutObjectCommand({
					Bucket: this.bucket,
					Key: probeKey,
					Body: body,
					ContentType: 'text/plain',
					ContentMD5: createHash('md5').update(body).digest('base64'),
				}),
			);
			await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: probeKey }));
			// Without a version id this only adds a delete marker, which object lock allows.
			await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: probeKey })).catch(() => undefined);
		} catch {
			problems.push('write');
		}
		const cors = await this.client.send(new GetBucketCorsCommand({ Bucket: this.bucket })).catch(() => null);
		const uploads = cors?.CORSRules?.some(
			(rule) =>
				rule.AllowedMethods?.includes('PUT') &&
				rule.AllowedOrigins?.some((origin) => origin === '*' || origin === webOrigin),
		);
		if (!uploads) problems.push('cors');
		return problems;
	}
	async put(key: string, bytes: Buffer, mime: string) {
		const result = await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: bytes,
				ContentType: mime,
				ContentMD5: createHash('md5').update(bytes).digest('base64'),
			}),
		);
		return version(result.VersionId);
	}
	upload(key: string, size: number, mime: string, checksum: string) {
		return getSignedUrl(
			this.client,
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				ContentLength: size,
				ContentType: mime,
				ChecksumSHA256: checksum,
			}),
			{ expiresIn: 300, signableHeaders: new Set(['content-length', 'content-type']) },
		);
	}
	async inspect(key: string) {
		const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })).catch((error) => {
			if (error.$metadata?.httpStatusCode === 404) throw new ApiError(409, 'error.conflict');
			throw error;
		});
		return { size: head.ContentLength, mimeType: head.ContentType, objectVersion: version(head.VersionId) };
	}
	/** The bytes of one version, for files the server sends itself (an invoice attached to a mail). */
	async read(key: string, versionId: string) {
		const result = await this.client.send(
			new GetObjectCommand({ Bucket: this.bucket, Key: key, VersionId: versionId }),
		);
		if (!result.Body) throw new ApiError(404, 'error.ws.not_found');
		return result.Body.transformToByteArray();
	}
	download(key: string, versionId: string) {
		return getSignedUrl(
			this.client,
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: key,
				VersionId: versionId,
				ResponseContentDisposition: 'attachment',
				ResponseContentType: 'application/octet-stream',
			}),
			{ expiresIn: 300 },
		);
	}
}
function version(id: string | undefined) {
	if (!id || id === 'null') throw new Error('Versioning is required on the document bucket');
	return id;
}
