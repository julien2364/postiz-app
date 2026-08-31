const fs = require('node:fs');
const path = require('node:path');
const {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const requiredEnvironment = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_ACCESS_KEY',
  'CLOUDFLARE_SECRET_ACCESS_KEY',
  'CLOUDFLARE_BUCKETNAME',
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Missing ${name}.`);
  }
}

const uploadsDirectory = process.env.UPLOADS_DIRECTORY || '/uploads';
const dryRun = process.argv.includes('--dry-run');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

async function main() {
  const files = walk(uploadsDirectory);
  const keys = files.map((file) => path.basename(file));
  const duplicateKeys = keys.filter(
    (key, index) => keys.indexOf(key) !== index
  );

  if (duplicateKeys.length) {
    throw new Error(
      `Duplicate basenames cannot be flattened safely (${
        new Set(duplicateKeys).size
      }).`
    );
  }

  const totalBytes = files.reduce(
    (total, file) => total + fs.statSync(file).size,
    0
  );

  if (dryRun) {
    console.log(
      JSON.stringify({ dryRun: true, files: files.length, totalBytes })
    );
    return;
  }

  const client = new S3Client({
    region: process.env.CLOUDFLARE_REGION || 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY,
      secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
    },
  });

  let uploaded = 0;
  let verified = 0;

  for (const file of files) {
    const key = path.basename(file);
    const size = fs.statSync(file).size;
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_BUCKETNAME,
        Key: key,
        Body: fs.createReadStream(file),
        ContentLength: size,
        ContentType: mime.lookup(file) || 'application/octet-stream',
        CacheControl: 'public, max-age=300, must-revalidate',
      })
    );
    uploaded += 1;

    const object = await client.send(
      new HeadObjectCommand({
        Bucket: process.env.CLOUDFLARE_BUCKETNAME,
        Key: key,
      })
    );
    if (object.ContentLength !== size) {
      throw new Error(`Size verification failed for object ${uploaded}.`);
    }
    verified += 1;
  }

  console.log(
    JSON.stringify({
      dryRun: false,
      files: files.length,
      totalBytes,
      uploaded,
      verified,
    })
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
