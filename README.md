# Git Clock

GitClock is an automation extension for Visual Studio Code that ensures your GitHub contributions remain active

![Extension Logo](./logo.jpeg) 

## Features

- **Automatic Commit Every 30 Minutes**: The extension automatically commits changes every 30 minutes to ensure that your work is regularly logged on main branch so that your git contribution is counted.
- **Sync Logs in Main Branch**: All your sync logs are stored in the `main` branch, ensuring that your contributions are tracked, even if you're working on a different branch.
- **Keeps Track of Your Hard Work**: By syncing your changes to the main branch, your contributions are always counted in the repository history, providing visibility of your continuous progress.
- **Works on Any Branch**: No need to worry about not being on the main branch. `gitClock` ensures your work is recorded regardless of the branch you're working on.
- **Customizable Commit Messages**: The commit messages are automatically generated to reflect the time and sync details, making your commit history clean and organized.
- **Lightweight and Simple**: The extension works quietly in the background without interrupting your workflow, only committing changes when necessary.


## Installation
1. **Manually:**
   - Download the `.vsix` file from the release page or https://open-vsx.org/extension/authorSanju/gitclock.
   - In Visual Studio Code, go to the Extensions view.
   - Click the three dots on the top right and select **Install from VSIX**.
   - Browse and select the `.vsix` file.
   - Press `Ctrl+Shift+P` to open command pallete
   - Write `GitClock : Authenticate`
   - Login
   - All Done

2. **VS Code:**
    - We are trying to get our extension on VS code Marketplace


## Usage
1. After installation, activate the extension via the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Search for `GitClock: Authenticate` and select it to authenticate the extension with the profile where you want your contributions to be counted.



## Contributing
- Fork the repository.
- Clone your fork: git clone https://github.com/your-username/your-extension-name.git
- Install dependencies: npm install
- Make your changes.
- Test extension
- Commit and push your changes.
- Create a pull request with a description of what you've changed.


## License
This extension is licensed under the MIT License. See LICENSE for more details.
