import { pathToFileURL } from "node:url";

export async function runLinkMyTeamCli() {
  throw new Error(
    "Password-based linking has been removed. Link your FPL account from the web app OAuth flow instead.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLinkMyTeamCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
