#!/bin/bash
set -e

echo "Setting up GitHub remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/Chathura369/MY-BOT-V2.git"

echo "Adding all files..."
git add -A

echo "Committing..."
git commit -m "Add Railway deployment config (Dockerfile, railway.json)" --allow-empty

echo "Pushing to GitHub..."
git branch -M main
git push -u origin main --force

echo ""
echo "Done! Pushed to GitHub!"
echo "Now go to https://railway.app and deploy from this repo."
