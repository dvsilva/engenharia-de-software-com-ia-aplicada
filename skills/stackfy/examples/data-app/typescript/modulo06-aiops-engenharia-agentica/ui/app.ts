import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import {
  CreateBucketCommand,
  ListBucketsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

type Notice = { kind: 'success' | 'info' | 'warning' | 'error'; text: string };

type Bucket = { name: string; createdAt: string };

type Click = 'create' | 'refresh' | 'audit';

type Interaction = { clicked?: Click; bucketName: string };

type Listing = { buckets?: Bucket[]; listingNotice?: Notice };

type Run = Listing & {
  bucketNotice?: Notice;
  toast?: string;
  governanceFailure?: string;
};

const PAGE = await readFile(new URL('app.html', import.meta.url), 'utf8');
const CLICKS: readonly Click[] = ['create', 'refresh', 'audit'];
const GOVERNANCE_FAILURE = "TypeError: 'Tool' object is not callable";

const endpoint = process.env.RUNNING_IN_DOCKER
  ? 'http://localstack:4566'
  : (process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566');

const s3 = new S3Client({
  endpoint,
  region: 'us-east-1',
  credentials: { accessKeyId: 'mock_key', secretAccessKey: 'mock_secret' },
  forcePathStyle: true,
});

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const twoDigits = (value: number) => String(value).padStart(2, '0');

const formatUtc = (date: Date) =>
  `${twoDigits(date.getUTCDate())}/${twoDigits(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())}:${twoDigits(date.getUTCSeconds())}`;

const createBucket = async (bucketName: string): Promise<Notice> => {
  if (!bucketName)
    return {
      kind: 'warning',
      text: '⚠️ Insira um nome válido para o bucket.',
    };

  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));

    return {
      kind: 'success',
      text: `✅ Bucket '${bucketName}' criado com sucesso!`,
    };
  } catch (error) {
    return {
      kind: 'error',
      text: `❌ Erro ao criar o bucket: ${messageOf(error)}`,
    };
  }
};

const listBuckets = async (): Promise<Listing> => {
  try {
    const { Buckets = [] } = await s3.send(new ListBucketsCommand({}));

    if (Buckets.length === 0)
      return {
        listingNotice: {
          kind: 'info',
          text: 'ℹ️ Nenhum bucket S3 encontrado no LocalStack. Crie um acima!',
        },
      };

    return {
      buckets: Buckets.map((bucket) => ({
        name: bucket.Name ?? '',
        createdAt: bucket.CreationDate ? formatUtc(bucket.CreationDate) : '',
      })),
    };
  } catch (error) {
    return {
      listingNotice: {
        kind: 'warning',
        text: `⚠️ Não foi possível listar os buckets. O LocalStack está de pé na porta 4566? (Erro: ${messageOf(error)})`,
      },
    };
  }
};

const runScript = async ({
  clicked,
  bucketName,
}: Interaction): Promise<Run> => ({
  ...(clicked === 'create'
    ? { bucketNotice: await createBucket(bucketName) }
    : {}),
  ...(clicked === 'refresh' ? { toast: 'Lista de Buckets atualizada!' } : {}),
  ...(await listBuckets()),
  ...(clicked === 'audit' ? { governanceFailure: GOVERNANCE_FAILURE } : {}),
});

const interactionOf = (fields: URLSearchParams): Interaction => ({
  clicked: CLICKS.find((click) => click === fields.get('clicked')),
  bucketName: fields.get('bucketName') ?? '',
});

const respond = async (request: IncomingMessage, response: ServerResponse) => {
  if (request.method !== 'POST' || request.url !== '/run') {
    response
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(PAGE);
    return;
  }

  const run = await runScript(
    interactionOf(new URLSearchParams(await text(request)))
  );

  response
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify(run));
};

createServer((request, response) =>
  respond(request, response).catch((error) =>
    response.writeHead(500).end(messageOf(error))
  )
).listen(Number(process.env.PORT ?? 8501));
