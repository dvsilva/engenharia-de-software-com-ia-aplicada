import { detectStack, readDependencies, unique } from './dependencies.mjs';
import { naturalCompare, toId, walk } from './folders.mjs';
import { slugTarget } from './targets.mjs';

const readDependenciesWithin = async (folder) => {
  const { folders } = await walk(folder);
  const stack = detectStack(folders.flatMap(({ files }) => files));
  const dependencies = await Promise.all(
    folders.map((member) =>
      readDependencies(member.folder, member.files, stack)
    )
  );

  return { stack, dependencies: unique(dependencies.flat()) };
};

export const listTranscriptions = async (root, target) => {
  const slug = slugTarget(target);
  const { transcriptions } = await walk(root);
  const results = [];

  for (const transcription of transcriptions) {
    if (transcription.target !== slug) continue;

    results.push({
      folder: toId(root, transcription.folder),
      original: toId(root, transcription.original),
      target: slug,
      ...(await readDependenciesWithin(transcription.folder)),
    });
  }

  return results.sort((left, right) =>
    naturalCompare(left.folder, right.folder)
  );
};
