type PrismaLikeError = Error & {
  code?: string;
  meta?: {
    modelName?: string;
    driverAdapterError?: {
      cause?: { kind?: string; constraint?: { index?: string } };
    };
  };
};

// What a log line may say about a caught error: its type, a short description and the stack
// frames. Prisma errors keep only code / model / constraint, because their message can quote the
// query arguments (player text, token hashes). Values that are not Errors are not printed at all.
export function errorTrace(error: unknown) {
  if (!(error instanceof Error)) {
    return 'non-Error value thrown';
  }
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '));
  return [`${error.name}: ${describe(error)}`, ...frames].join('\n');
}

function describe(error: Error) {
  if (error.name.startsWith('PrismaClient')) {
    const { code, meta } = error as PrismaLikeError;
    const cause = meta?.driverAdapterError?.cause;
    const parts = [
      code,
      meta?.modelName,
      cause?.kind,
      cause?.constraint?.index,
    ];
    return parts.filter(Boolean).join(' ') || 'details omitted';
  }
  return error.message.split('\n')[0].slice(0, 200);
}
