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

async function handleRepoAndReadme(accessToken) {
  console.log(accessToken, " : accessToken");
  try {
    // Get user info
    const userResponse = await axios.get(`${GITHUB_API_URL}/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const username = userResponse.data.login;
    console.log("User:", username);

    // Check if the repo is empty by trying to fetch the contents of the repo
    let contentsResponse;
    try {
      contentsResponse = await axios.get(
        `${GITHUB_API_URL}/repos/${username}/${REPO_NAME}/contents`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // If repository is empty (404), we will create the README.md
        console.log("Repository is empty. Creating README.md...");
        const newContent = `# GitClock LifeCycle

gitClock is a Visual Studio Code extension designed to help developers maintain a record of their contributions within a repository, even when they are not committing directly to the main branch. This extension tracks changes to files across all branches and provides a comprehensive list of file modifications, ensuring that every contribution is documented. Note: The change log only includes file names and does not contain any private data or commit details, respecting user privacy.

| Time (UTC)             | Files Modified                    | Changes (Addition/Deletion) | 
|------------------------|-----------------------------------|-----------------------------| 
| ${new Date().toLocaleString()} | File2.txt (5/2), hi.txt (3/1)     | 5/2, 3/1                   | 
`;
        const base64NewContent = Buffer.from(newContent).toString("base64");

        await createFile(accessToken, username, base64NewContent);
        return;
      } else {
        throw error; // Rethrow error if it's not a 404
      }
    }

    // If repository is not empty, continue processing
    console.log(contentsResponse.data);

    const readmeFile = contentsResponse.data.find(
      (file) => file.name === "README.md"
    );

    if (readmeFile) {
      // Fetch and update README.md content
      const readmeContentResponse = await axios.get(readmeFile.download_url);
      const readmeContent = Buffer.from(readmeContentResponse.data, "base64").toString("utf-8");

      // Append new change log
      const updatedContent = readmeContent + `\n## Change Log\n- ${new Date().toLocaleString()} - Updated files`;
      const base64UpdatedContent = Buffer.from(updatedContent).toString("base64");

      await updateFile(accessToken, username, readmeFile, base64UpdatedContent);
    } else {
      // If README.md doesn't exist, create it with new format
      const newContent = `# GitClock LifeCycle

gitClock is a Visual Studio Code extension designed to help developers maintain a record of their contributions within a repository, even when they are not committing directly to the main branch. This extension tracks changes to files across all branches and provides a comprehensive list of file modifications, ensuring that every contribution is documented. Note: The change log only includes file names and does not contain any private data or commit details, respecting user privacy.

| Time (UTC)             | Files Modified                    | Changes (Addition/Deletion) | 
|------------------------|-----------------------------------|-----------------------------| 
| ${new Date().toLocaleString()} | File2.txt (5/2), hi.txt (3/1)     | 5/2, 3/1                   | 
`;
      const base64NewContent = Buffer.from(newContent).toString("base64");

      await createFile(accessToken, username, base64NewContent);
    }

    vscode.window.showInformationMessage(`Changes pushed to ${REPO_URL}`);
  } catch (error) {
    console.error(error);
    vscode.window.showErrorMessage(
      "Error handling repository and README.md: " + error.message
    );
  }
}

async function updateFile(accessToken, username, file, content) {
  try {
    await axios.put(
      `${GITHUB_API_URL}/repos/${username}/${REPO_NAME}/contents/${file.path}`,
      {
        message: "Update README.md with change log", // Commit message
        content: content,
        sha: file.sha, // Provide the SHA of the existing file for update
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      "Error updating README.md: " + error.message
    );
  }
}

async function createFile(accessToken, username, content) {
  try {
    await axios.put(
      `${GITHUB_API_URL}/repos/${username}/${REPO_NAME}/contents/README.md`,
      {
        message: "Create README.md with initial content", // Commit message
        content: content,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      "Error creating README.md: " + error.message
    );
  }
}




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
    monitorFileChanges(accessToken);
  }
}
async function monitorFileChanges(accessToken) {
  const currentWorkingDir = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;

  if (!currentWorkingDir) {
    console.log("No workspace folder is open. Skipping file monitoring.");
    return;
  }

  console.log(`Monitoring changes in: ${currentWorkingDir}`);

  setInterval(async () => {
    exec(
      "git status --short",
      { cwd: currentWorkingDir },
      async (error, stdout) => {
        if (error) {
          console.error("Error getting Git status:", error.message);
          return;
        }

        if (stdout.trim() === "") {
          console.log("No changes detected.");
          return;
        }

        const changedFiles = stdout
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => {
            const [status, fileName] = line.split(/\s+/);
            return { status, fileName };
          });

        console.log(
          "Changed files:",
          changedFiles.map((f) => f.fileName).join(", ")
        );

        // Trigger GitHub repo and README.md updates
        try {
          console.log("Updating repository with detected changes...");
          await handleRepoAndReadme(accessToken);
          vscode.window.showInformationMessage("Changes logged successfully!");
        } catch (err) {
          console.error("Error updating repository or README.md:", err.message);
        }
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
