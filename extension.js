const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
const vscode = require("vscode");
const http = require("http");
const querystring = require("querystring");
const axios = require("axios");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const AUTH_URL = process.env.AUTH_URL;
const TOKEN_URL = process.env.TOKEN_URL;
const REDIRECT_URI = process.env.REDIRECT_URI;
const GITHUB_API_URL = process.env.GITHUB_API_URL;
const REPO_NAME = process.env.REPO_NAME;
/**
 * @param {vscode.ExtensionContext} context
 */

async function activate(context) {
  console.log("GitClock extension is now active!");

  // Register the startOAuth command
  const disposable = vscode.commands.registerCommand(
    "gitclock.startOAuth",
    async function () {
      try {
        // Dynamically import 'open' (for opening URLs)
        const { default: open } = await import("open");

        // Open the GitHub authorization URL
        vscode.window.showInformationMessage("Opening GitHub login page...");
        open(AUTH_URL);

        // Start a local server to listen for the OAuth callback
        const server = http.createServer(async (req, res) => {
          if (req.url.startsWith("/oauthCallback")) {
            const queryParams = querystring.parse(req.url.split("?")[1]);
            const code = queryParams.code;

            if (!code) {
              res.writeHead(400, { "Content-Type": "text/plain" });
              res.end("Error: No code received.");
              return;
            }

            try {
              // Exchange the code for an access token
              const tokenResponse = await axios.post(
                TOKEN_URL,
                {
                  client_id: CLIENT_ID,
                  client_secret: CLIENT_SECRET,
                  code: code,
                  redirect_uri: REDIRECT_URI,
                },
                { headers: { Accept: "application/json" } }
              );

              const accessToken = tokenResponse.data.access_token;

              if (accessToken) {
                vscode.window.showInformationMessage(
                  "GitHub login successful!"
                );
                context.globalState.update("githubAccessToken", accessToken);
                checkAndCreateRepo(accessToken);
              } else {
                vscode.window.showErrorMessage(
                  "Failed to obtain access token."
                );
              }
            } catch (error) {
              vscode.window.showErrorMessage(
                "Error exchanging code for token: " + error.message
              );
            }

            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("You can close this window and return to VS Code.");

            // Close the server after handling the request
            server.close();
          } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
          }
        });

        server.listen(5000, () => {
          console.log("Listening on http://localhost:5000 for OAuth callback");
        });
      } catch (error) {
        vscode.window.showErrorMessage(
          "Error starting OAuth flow: " + error.message
        );
      }
    }
  );

  context.subscriptions.push(disposable);

  // Check authentication on startup
  const accessToken = context.globalState.get("githubAccessToken");
  if (!accessToken) {
    vscode.window.showErrorMessage(
      "You are not authenticated. Please log in using GitHub."
    );
  } else {
    checkAndCreateRepo(accessToken);
    monitorFileChanges();
  }
}

function monitorFileChanges() {
  const currentWorkingDir = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;

  if (!currentWorkingDir) {
    console.log("No workspace folder is open. Skipping file monitoring.");
    return;
  }

  console.log(`Monitoring changes in: ${currentWorkingDir}`);

  setInterval(() => {
    // Check if the directory is a Git repository
    exec(
      "git rev-parse --is-inside-work-tree",
      { cwd: currentWorkingDir },
      (error) => {
        if (error) {
          console.log("Not a Git repository. Skipping this iteration.");
          return;
        }

        // Get the list of changed files using `git status --short`
        exec(
          "git status --short",
          { cwd: currentWorkingDir },
          (error, stdout) => {
            if (error) {
              console.error("Error getting Git status:", error.message);
              return;
            }

            if (stdout.trim() === "") {
              console.log("No changes detected.");
            } else {
              const changedFiles = stdout
                .split("\n")
                .filter((line) => line.trim() !== "")
                .map((line) => {
                  const [, fileName] = line.split(/\s+/);
                  return fileName;
                });

              console.log("Changed files:", changedFiles.join(", "));

              // Fetch detailed changes for each file
              changedFiles.forEach((fileName) => {
                // Ensure the file name is not undefined or empty
                if (!fileName) return;

                // Check if the file is newly initialized (untracked)
                exec(
                  `git diff --name-status ${fileName}`,
                  { cwd: currentWorkingDir },
                  (diffError, diffStdout) => {
                    if (diffError) {
                      console.error(`Error checking diff for ${fileName}:`, diffError.message);
                      return;
                    }

                    if (!diffStdout.trim()) {
                      console.log(`File ${fileName} has no staged changes or is untracked.`);
                    } else {
                      const diffDetails = diffStdout
                        .trim()
                        .split("\n")
                        .map((line) => {
                          const [status, file] = line.split(/\s+/);
                          
                          // Check if it's an added or modified file
                          if (status === "A") {
                            return `File ${file} is added to the repo.`;
                          } else if (status === "M") {
                            return `File ${file} is modified (changes not staged).`;
                          } else if (status === "??") {
                            return `File ${file} is untracked (newly created file).`;
                          }
                        });

                      console.log(diffDetails.join("\n"));
                    }
                  }
                );
              });
            }
          }
        );
      }
    );
  }, 2 * 60 * 1000); // Run every 2 minutes
}



async function checkAndCreateRepo(accessToken) {
  try {
    console.log(process.env.GITHUB_API_URL);
    const userResponse = await axios.get(`${GITHUB_API_URL}/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const username = userResponse.data.login;
    try {
      const reposResponse = await axios.get(`${GITHUB_API_URL}/user/repos`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const repoExists = reposResponse.data.some(
        (repo) => repo.name === REPO_NAME
      );

      if (repoExists) {
        vscode.window.showInformationMessage(
          `Repository "${REPO_NAME}" exists.`
        );
      } else {
        console.log(`Repository "${REPO_NAME}" not found. Creating it...`);
        await createRepo(accessToken);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        "Error checking repository: " +
          (error.response ? error.response.data.message : error.message)
      );
    }
  } catch (error) {
    console.log(error);
    if (error.response && error.response.status === 404) {
      vscode.window.showErrorMessage(
        "Authentication failed or repository creation failed."
      );
    }
    console.error("Error checking or creating repo: ", error.message);
  }
}

async function createRepo(accessToken) {
  try {
    const userResponse = await axios.get(`${GITHUB_API_URL}/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const username = userResponse.data.login;

    const createRepoResponse = await axios.post(
      `${GITHUB_API_URL}/user/repos`,
      {
        name: REPO_NAME,
        private: false,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (createRepoResponse.status === 201) {
      vscode.window.showInformationMessage(
        `Repository "${REPO_NAME}" created successfully.`
      );
    } else {
      vscode.window.showErrorMessage("Failed to create repository.");
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      "Error creating repository: " + error.message
    );
  }
}

function deactivate() {
  console.log("GitClock extension deactivated.");
}

module.exports = {
  activate,
  deactivate,
};
