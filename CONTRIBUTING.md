# Contributing to IAAS 💜

Thank you for considering contributing to IAAS (Infrastructure as a Service)!  
We want this project to be welcoming, beginner-friendly, and valuable for everyone contributing.  

This guide will help you understand what kinds of contributions we welcome, how to get started, and how to contribute.  


## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Hacktoberfest](#hacktoberfest)
- [Issue Labels](#issue-labels)
- [How to Contribute](#how-to-contribute)


## Code of Conduct

We are committed to providing a welcoming, safe, and inclusive environment.  Please read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).  

In short:  
- Be kind and respectful.  
- Help create a space where everyone feels valued.  
- Harassment or disrespect will not be tolerated.  

## Hacktoberfest

This project participates in [Hacktoberfest](https://hacktoberfest.com/)!  That means your contributions here will count towards your Hacktoberfest goals.  

We will:  
- Tag issues with `hacktoberfest` when they are valid for contribution.  
- Provide clear guidance on which issues are `good first issue` for beginners.  
- Actively review and merge PRs during October (and beyond).  

## Issue Labels

We use labels to organize contributions and guide contributors:

- `good first issue` → Beginner-friendly tasks  

- `help wanted` → Issues where we’d love community help  

- `bug` → Something isn’t working correctly  
- `documentation` → Docs need improvements or updates  
- `enhancement` → Feature requests and improvements  
- `hacktoberfest` → Issues valid for Hacktoberfest submissions  

If you’re new, we highly recommend looking for **`good first issue`** or **`documentation`** to get started.  

## How to Contribute

There are many ways to contribute to Infrastructure as a Service:

- **Report bugs** → If you spot something not working as expected, open an issue with clear steps to reproduce the problem. 

- **Suggest features** → Got an idea for an improvement or a new cloud provider supported by Pulumi? We’d love to hear it. 

- **Improve documentation** → Add examples, or make instructions clearer for future contributors.

- **Contribute code** → Solve open issues, write tests, run and verify deployments, improve performance, or implement new features.

### Here’s the step-by-step process to follow when contributing:

1. **Find or suggest an issue**   
   - Browse the existing [issues](https://github.com/Chimoney/Iaas/issues) to see if the problem or feature you have in mind already exists.
   - If you don’t see it listed, feel free to open a new issue using our provided [issue templates here]()
 
2. **Ask to be sssigned**  
   - Comment on the issue saying you’d like to work on it.  
   - Maintainers will confirm and assign the issue to you.  
   - Please wait until you are assigned before starting work to avoid duplication.  

3. **Set up your local environment**  
   - Follow the steps in the [Quick start guide](/readme.md) here to install dependencies and get the project running locally.

4. **Create a branch**  
   - Always create a new branch from `main`:  

     ```bash
     git checkout main
     git pull origin main
     git checkout -b feature/your-feature
     ```

5. **Make your changes**  
   - Implement the fix, feature, or documentation improvement.  
   - Keep commits small and focused.  
   - Use [Conventional Commit messages](https://www.conventionalcommits.org/):  

     ```
     feat: add Azure AKS support
     docs: clarify contributing instructions
     ```

6. **Test your work**  
   - Run builds/tests locally.  
   - If possible, verify your changes with a sample deployment.  

7. **Commit and push**  
   - Commit your changes:  

     ```bash
     git add .
     git commit -m "feat: short but clear description"
     ```  
   - Push your branch to your fork:  
     ```bash
     git push origin feature/your-feature
     ```  

8. **Open a pull request**  
   - Go to the GitHub page for your fork.  
   - Open a Pull Request to the `main` branch of this repo using this [PR template]()

9. **Wait for review**  
   - A maintainer will review your PR within 3-4 working days. 
   - Be open to feedback, it’s part of the collaboration process.    

10. **Approval and merge**  
    - Once approved, the maintainer will merge your PR into `main`.  

___    

✨ If you ever feel stuck, join our Discord community
 and drop your questions in the [#iaas channel](https://discord.gg/TxyA9dG4uj). We’ll be happy to help. 💜

Happy contributing, and welcome aboard! 🚀