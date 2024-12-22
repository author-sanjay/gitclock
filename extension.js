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

async function handleRepoAndReadme(accessToken, changedFiles) {
  try {
    const userResponse = await axios.get(`${GITHUB_API_URL}/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const username = userResponse.data.login;
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
        const newContent = generateReadmeContent(changedFiles);
        const base64NewContent = Buffer.from(newContent).toString("base64");

        await createFile(accessToken, username, base64NewContent);
        return;
      } else {
        throw error;
      }
    }

    const readmeFile = contentsResponse.data.find(
      (file) => file.name === "README.md"
    );

    const changesList = changedFiles
      .map(
        (file) =>
          `| ${new Date().toLocaleString()} | ${file.fileName} | ${
            file.additions
          } Additions & ${file.deletions} Deletions|`
      )
      .join("\n");

    if (readmeFile) {
      const readmeContentResponse = await axios.get(readmeFile.download_url);
      const readmeContent = readmeContentResponse.data;
      const updatedContent = appendToTable(readmeContent, changesList);
      const base64UpdatedContent =
        Buffer.from(updatedContent).toString("base64");

      await updateFile(accessToken, username, readmeFile, base64UpdatedContent);
    } else {
      const newContent = generateReadmeContent(changedFiles);
      const base64NewContent = Buffer.from(newContent).toString("base64");

      await createFile(accessToken, username, base64NewContent);
    }

    vscode.window.showInformationMessage(`Changes pushed to Repository`);
  } catch (error) {
    vscode.window.showErrorMessage(
      "Error handling repository and README.md: " + error.message
    );
  }
}

function appendToTable(existingContent, newChanges) {
  const tableRegex = /\| Time \(UTC\)[\s\S]*?\n(\|[-]+.*?\n)?([\s\S]*?)\n$/;
  const match = tableRegex.exec(existingContent);

  if (match) {
    const existingTable = match[2] || "";
    const updatedTable = `${existingTable.trim()}\n${newChanges.trim()}`; 
    return existingContent.replace(match[2], updatedTable);
  } else {
    return (
      existingContent +
      `\n| Time (UTC)             | Files Modified                    | Changes (Addition/Deletion) |\n|------------------------|-----------------------------------|-----------------------------|\n${newChanges}`
    );
  }
}

function generateReadmeContent(changedFiles) {
  const changesList = changedFiles
    .map(
      (file) =>
        `| ${new Date().toLocaleString()} | ${file.fileName} | ${
          file.additions
        }/${file.deletions} |`
    )
    .join("\n");

  return `# GitClock LifeCycle

gitClock is a Visual Studio Code extension designed to help developers maintain a record of their contributions within a repository, even when they are not committing directly to the main branch. This extension tracks changes to files across all branches and provides a comprehensive list of file modifications, ensuring that every contribution is documented. Note: The change log only includes file names and does not contain any private data or commit details, respecting user privacy.

| Time (UTC)             | Files Modified                    | Changes (Addition/Deletion) |
|------------------------|-----------------------------------|-----------------------------|
${changesList}
`;
}

async function updateFile(accessToken, username, file, content) {
  try {
    await axios.put(
      `${GITHUB_API_URL}/repos/${username}/${REPO_NAME}/contents/${file.path}`,
      {
        message: "Update README.md with change log",
        content: content,
        sha: file.sha,
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
        message: "Create README.md with initial content",
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
  const disposable = vscode.commands.registerCommand(
    "gitclock.startOAuth",
    async function () {
      try {
        const { default: open } = await import("open");
        vscode.window.showInformationMessage("Opening GitHub login page...");
        open(AUTH_URL);
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
            server.close();
          } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
          }
        });

        server.listen(5000, () => {
        });
      } catch (error) {
        vscode.window.showErrorMessage(
          "Error starting OAuth flow: " + error.message
        );
      }
    }
  );

  context.subscriptions.push(disposable);
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
    return;
  }


  setInterval(async () => {
    exec(
      "git status --short",
      { cwd: currentWorkingDir },
      async (error, stdout) => {
        if (error) {
          return;
        }

        if (stdout.trim() === "") {
          return;
        }

        const changedFiles = await Promise.all(
          stdout
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map(async (line) => {
              const [status, ...fileParts] = line.trim().split(/\s+/);
              const fileName = fileParts.join(" "); 

              if (status === "??") {
                return {
                  status: "New file (untracked)",
                  fileName,
                  additions: 0,
                  deletions: 0,
                };
              } else if (status === "M") {
                const diffResult = await getDiffStats(
                  currentWorkingDir,
                  fileName
                );
                return { status: "Modified", fileName, ...diffResult };
              } else {
                return { status, fileName, additions: 0, deletions: 0 };
              }
            })
        );


        try {
          await handleRepoAndReadme(accessToken, changedFiles);
          vscode.window.showInformationMessage("Changes logged successfully!");
        } catch (err) {
        }
      }
    );
  }, 30 * 60 * 1000);
}

function getDiffStats(cwd, fileName) {
  return new Promise((resolve) => {
    exec(`git diff --numstat -- "${fileName}"`, { cwd }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve({ additions: undefined, deletions: undefined }); 
        return;
      }

      const [additions, deletions] = stdout.trim().split("\t");
      resolve({
        additions: parseInt(additions, 10),
        deletions: parseInt(deletions, 10),
      });
    });
  });
}

async function checkAndCreateRepo(accessToken) {
  try {
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
        await createRepo(accessToken);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        "Error checking repository: " +
          (error.response ? error.response.data.message : error.message)
      );
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      vscode.window.showErrorMessage(
        "Authentication failed or repository creation failed."
      );
    }
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
