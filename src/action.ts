import { ConfigurationProvider } from './ConfigurationProvider';
import { VersionResult } from './VersionResult';
import { VersionType } from './providers/VersionType';
import { UserInfo } from './providers/UserInfo';
import { VersionInformation } from './providers/VersionInformation';
import { DebugManager } from './DebugManager';

export async function runAction(configurationProvider: ConfigurationProvider): Promise<VersionResult> {

  console.log('runAction start');

  const currentCommitResolver = configurationProvider.GetCurrentCommitResolver();
  const lastReleaseResolver = configurationProvider.GetLastReleaseResolver();
  const commitsProvider = configurationProvider.GetCommitsProvider();
  const versionClassifier = configurationProvider.GetVersionClassifier();
  const versionFormatter = configurationProvider.GetVersionFormatter();
  const tagFormatter = configurationProvider.GetTagFormatter(await currentCommitResolver.ResolveBranchNameAsync());
  const userFormatter = configurationProvider.GetUserFormatter();

  const debugManager = DebugManager.getInstance();

  console.log('runAction before currentCommitResolver.IsEmptyRepoAsync()');

  if (await currentCommitResolver.IsEmptyRepoAsync()) {

    console.log('runAction inside currentCommitResolver.IsEmptyRepoAsync()');

    const versionInfo = new VersionInformation(0, 0, 0, 0, VersionType.None, [], false, false);
    return new VersionResult(
      versionInfo.major,
      versionInfo.minor,
      versionInfo.patch,
      versionInfo.increment,
      versionInfo.type,
      versionFormatter.Format(versionInfo),
      tagFormatter.Format(versionInfo),
      versionInfo.changed,
      versionInfo.isTagged,
      userFormatter.Format('author', []),
      '',
      '',
      tagFormatter.Parse(tagFormatter.Format(versionInfo)).join('.'),
      debugManager.getDebugOutput(true)
    );
  }

  const currentCommit = await currentCommitResolver.ResolveAsync();
  const lastRelease = await lastReleaseResolver.ResolveAsync(currentCommit, tagFormatter);
  const commitSet = await commitsProvider.GetCommitsAsync(lastRelease.hash, currentCommit);
  const classification = await versionClassifier.ClassifyAsync(lastRelease, commitSet);

  console.log('runAction after all await. currentCommit: ' + currentCommit + ', lastRelease: ' + lastRelease + ', commitSet: ' + commitSet + ', classification: ' + classification);

  const { isTagged } = lastRelease;
  const { major, minor, patch, increment, type, changed } = classification;

  // At this point all necessary data has been pulled from the database, create
  // version information to be used by the formatters
  let versionInfo = new VersionInformation(major, minor, patch, increment, type, commitSet.commits, changed, isTagged);

  // Group all the authors together, count the number of commits per author
  const allAuthors = versionInfo.commits
    .reduce((acc: any, commit) => {
      const key = `${commit.author} <${commit.authorEmail}>`;
      acc[key] = acc[key] || { n: commit.author, e: commit.authorEmail, c: 0 };
      acc[key].c++;
      return acc;
    }, {});

  const authors = Object.values(allAuthors)
    .map((u: any) => new UserInfo(u.n, u.e, u.c))
    .sort((a: UserInfo, b: UserInfo) => b.commits - a.commits);

  console.log('runAction before return new VersionResult with currentCommit: ' + currentCommit + ', lastRelease: ' + lastRelease + ', authors: ' + authors);

  return new VersionResult(
    versionInfo.major,
    versionInfo.minor,
    versionInfo.patch,
    versionInfo.increment,
    versionInfo.type,
    versionFormatter.Format(versionInfo),
    tagFormatter.Format(versionInfo),
    versionInfo.changed,
    versionInfo.isTagged,
    userFormatter.Format('author', authors),
    currentCommit,
    lastRelease.hash,
    `${lastRelease.major}.${lastRelease.minor}.${lastRelease.patch}`,
    debugManager.getDebugOutput()
  );
}
