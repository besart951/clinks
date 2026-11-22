import {
	CreateBucketCommand,
	GetObjectLockConfigurationCommand,
	HeadBucketCommand,
	PutBucketCorsCommand,
	PutBucketLifecycleConfigurationCommand,
	PutObjectLockConfigurationCommand,
} from '@aws-sdk/client-s3';
import { z } from 'zod';
import { ObjectStore } from './object-store.ts';

const env = z
	.object({
		S3_BUCKET: z.string().min(1),
		S3_ENDPOINT: z.url(),
		S3_REGION: z.string().default('us-east-1'),
		WEB_ORIGIN: z.url(),
		S3_NONCURRENT_DAYS: z.coerce.number().int().positive().optional(),
		S3_LOCK_MODE: z.enum(['COMPLIANCE', 'GOVERNANCE']),
		S3_RETENTION_DAYS: z.coerce.number().int().positive(),
	})
	.parse(process.env);
const { client, bucket } = new ObjectStore(env.S3_BUCKET, env.S3_ENDPOINT, env.S3_REGION);
try {
	await client.send(new HeadBucketCommand({ Bucket: bucket }));
} catch (error) {
	if ((error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode !== 404) throw error;
	await client.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true }));
}
await client.send(
	new PutObjectLockConfigurationCommand({
		Bucket: bucket,
		ObjectLockConfiguration: {
			ObjectLockEnabled: 'Enabled',
			Rule: { DefaultRetention: { Mode: env.S3_LOCK_MODE, Days: env.S3_RETENTION_DAYS } },
		},
	}),
);
await client.send(
	new PutBucketCorsCommand({
		Bucket: bucket,
		CORSConfiguration: {
			CORSRules: [
				{
					AllowedOrigins: [env.WEB_ORIGIN],
					AllowedMethods: ['GET', 'PUT', 'HEAD'],
					AllowedHeaders: ['content-type', 'x-amz-*'],
					MaxAgeSeconds: 300,
				},
			],
		},
	}),
);
if (env.S3_NONCURRENT_DAYS) {
	await client.send(
		new PutBucketLifecycleConfigurationCommand({
			Bucket: bucket,
			LifecycleConfiguration: {
				Rules: [
					{
						ID: 'abort-interrupted-uploads',
						Status: 'Enabled',
						Filter: { Prefix: '' },
						AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
					},
					{
						ID: 'expire-released-noncurrent-versions',
						Status: 'Enabled',
						Filter: { Tag: { Key: 'retention', Value: 'released' } },
						NoncurrentVersionExpiration: { NoncurrentDays: env.S3_NONCURRENT_DAYS },
					},
				],
			},
		}),
	);
}
console.log((await client.send(new GetObjectLockConfigurationCommand({ Bucket: bucket }))).ObjectLockConfiguration);
