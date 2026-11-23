import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import { ApiError } from './errors.ts';

export class ObjectStore {
	readonly client: S3Client;
	readonly bucket: string;

	constructor(bucket: string, endpoint: string | undefined, region: string) {
		this.bucket = bucket;
		this.client = new S3Client({ endpoint, region, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED' });
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
