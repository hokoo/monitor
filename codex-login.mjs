import {spawn} from 'node:child_process';
import {claimProfile, childEnv, profileName} from './codex.mjs';

process.umask(0o077);

const alias = process.argv.length === 3 && profileName(`local:${process.argv[2]}`) ? process.argv[2] : null;
if (!alias) {
  console.error('Usage: node codex-login.mjs PROFILE_ALIAS');
  process.exitCode = 1;
} else {
  let profile, child;
  try {
    profile = await claimProfile(alias);
    child = spawn('codex', ['-c', 'cli_auth_credentials_store="file"', 'login'], {cwd: profile.home, env: childEnv(profile.home), stdio: 'inherit'});
    let hardKill;
    const stop = () => {child.kill('SIGTERM'); hardKill ??= setTimeout(() => child.kill('SIGKILL'), 1000);};
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    const code = await new Promise(resolve => {child.once('close', resolve); child.once('error', () => resolve(1));});
    clearTimeout(hardKill);
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    process.exitCode = code === 0 ? 0 : 1;
  } catch {
    console.error('Could not start isolated Codex login; check profile ownership and permissions.');
    process.exitCode = 1;
  } finally {await profile?.release();}
}
