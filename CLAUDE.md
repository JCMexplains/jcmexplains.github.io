# CLAUDE.md - AI Assistant Guide for jcmexplains.github.io

## Project Overview

This is a personal portfolio website for Jamie Martin (JCMexplains), built with Jekyll and hosted on GitHub Pages. The site serves as a professional landing page showcasing educational projects, including a developmental writing textbook and YouTube channel.

**Live Site**: https://www.jcmexplains.com
**Repository**: JCMexplains/jcmexplains.github.io
**Platform**: GitHub Pages with Jekyll static site generator
**Theme**: Minima (customized)

## Repository Structure

```
jcmexplains.github.io/
├── _config.yml              # Jekyll configuration
├── _layouts/                # HTML templates
│   ├── default.html        # Base layout with header
│   └── page.html           # Article wrapper layout
├── _includes/              # Reusable HTML components
│   └── head.html           # HTML head section
├── _sass/                  # SCSS partials
│   └── custom.scss         # Custom styles
├── assets/
│   ├── css/
│   │   └── main.scss       # Main stylesheet (imports minima + custom)
│   └── fonts/
│       └── TAYBigBirdRegular.woff2  # Custom font
├── CNAME                   # Custom domain configuration
├── index.md                # Homepage content
├── jamie-cartoon.jpg       # Profile image
└── zotero-logo-128x31.png  # Asset image
```

## Key Technologies

- **Jekyll**: Static site generator with Liquid templating
- **Theme**: Minima (Jekyll's default theme)
- **Markdown**: GitHub Flavored Markdown (GFM) for content
- **SCSS**: Sass preprocessing for stylesheets
- **GitHub Pages**: Hosting and automatic deployment
- **Custom Font**: TAYBigBirdRegular (WOFF2 format)

## Development Workflow

### Branch Strategy

- **Main Branch**: Production branch (auto-deploys to GitHub Pages)
- **Feature Branches**: Use `claude/` prefix for AI-assisted development
  - Pattern: `claude/claude-md-mkfk53fnam3v5dpo-<session-id>`
  - Always develop on designated feature branches
  - Create branches locally if they don't exist

### Git Operations

**Committing:**
- Use clear, descriptive commit messages
- Common patterns from history: "updates", "attribution", "revert"
- Keep commits focused and atomic

**Pushing:**
- Always use: `git push -u origin <branch-name>`
- Branch must start with 'claude/' for AI sessions
- Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network errors
- Never push to different branches without permission

**Pulling/Fetching:**
- Prefer: `git fetch origin <branch-name>`
- For pulls: `git pull origin <branch-name>`
- Same retry logic as pushing on network failures

### Deployment

GitHub Pages automatically builds and deploys the main branch. Changes pushed to main are live within minutes at www.jcmexplains.com.

## Content Management

### Adding/Editing Content

1. **Homepage**: Edit `index.md` using Markdown
2. **New Pages**: Create `.md` files in root (though currently single-page)
3. **Images**: Place in root directory, reference with `![alt](filename.jpg)`
4. **Links**: Use standard Markdown link syntax

### Markdown Configuration

- **Renderer**: GitHub Flavored Markdown (GFM)
- Supports: tables, strikethrough, task lists, autolinks
- Images automatically sized to max-width: 100%

## Styling Conventions

### CSS/SCSS Architecture

1. **main.scss** (`assets/css/main.scss`):
   - Imports minima theme
   - Imports custom styles
   - Uses Jekyll front matter (`---`)

2. **custom.scss** (`_sass/custom.scss`):
   - Custom styles override minima defaults
   - Font-face declaration for TAYBigBirdRegular
   - Responsive design with max-width: 800px
   - System font stack as fallback

### Typography

- **Site Title**: TAYBigBirdRegular font at 2.5rem
- **Links**: TAYBigBirdRegular font
- **Body**: System UI font stack (system-ui, -apple-system, sans-serif)
- **Line Height**: 1.5 for readability

### Layout

- Max content width: 800px
- Centered layout with auto margins
- 2rem padding on body
- Simple header with 1px border bottom

## Key Conventions

### File Naming

- Use lowercase with hyphens for new files
- Markdown files: `.md` extension
- Images: descriptive names (e.g., `jamie-cartoon.jpg`)

### Layout Inheritance

```
index.md → page.html → default.html
```

- `default.html`: Provides HTML structure, header, and main wrapper
- `page.html`: Adds article wrapper with post-content class
- Content files specify layout in front matter

### Custom Domain

- Domain configured via `CNAME` file: `www.jcmexplains.com`
- GitHub Pages handles DNS routing automatically

## Configuration Reference

### _config.yml Settings

```yaml
theme: minima
title: Jamie Martin
markdown: GFM
sass:
  sass_dir: _sass
  style: compressed
```

- **Theme**: Using Jekyll's minima theme as base
- **Title**: Displayed in site header
- **Markdown**: GitHub Flavored Markdown processor
- **Sass**: Compressed output for production

## Important Notes for AI Assistants

### What to Preserve

1. **Custom Font**: TAYBigBirdRegular is integral to site identity
2. **Simple Design**: Minimalist approach is intentional
3. **Educational Focus**: Content centers on teaching and education projects
4. **Single Page**: Currently one-page design; don't over-architect

### What to Avoid

1. **Over-engineering**: This is a simple portfolio site, keep it that way
2. **Breaking Changes**: Test locally before pushing to main
3. **Font Changes**: Don't modify TAYBigBirdRegular usage without approval
4. **Complex Structures**: No need for collections, data files, or pagination currently

### Making Changes

**Content Updates:**
- Edit `index.md` directly
- Use GitHub Flavored Markdown
- Reference images with relative paths
- Keep content concise and professional

**Style Updates:**
- Modify `_sass/custom.scss` for style changes
- Test that changes don't break responsive design
- Ensure readability on mobile devices
- Keep custom styles organized and commented

**Layout Changes:**
- Modify layouts only if necessary
- Test that Liquid tags render correctly
- Preserve Jekyll front matter
- Ensure backward compatibility

### Testing Changes

Since this is GitHub Pages:
1. Changes to main branch deploy automatically
2. Test on feature branches when possible
3. Preview locally with `jekyll serve` if available
4. Check responsive design at various widths

## Common Tasks

### Update Homepage Content

```bash
# Edit the main content
vim index.md

# Commit and push
git add index.md
git commit -m "update homepage content"
git push -u origin <branch-name>
```

### Add New Image

```bash
# Add image to root directory
cp path/to/image.jpg ./

# Reference in index.md
echo "![Description](image.jpg)" >> index.md

# Commit both
git add image.jpg index.md
git commit -m "add new image"
git push -u origin <branch-name>
```

### Modify Styles

```bash
# Edit custom styles
vim _sass/custom.scss

# Jekyll will automatically recompile
git add _sass/custom.scss
git commit -m "update custom styles"
git push -u origin <branch-name>
```

## Jekyll Build Process

GitHub Pages builds automatically:

1. Push to main branch triggers build
2. Jekyll processes:
   - Converts Markdown to HTML
   - Applies layouts and includes
   - Compiles SCSS to CSS
   - Generates static HTML files
3. Site deploys to www.jcmexplains.com
4. Build typically completes in 1-2 minutes

## Troubleshooting

### Common Issues

**Site Not Updating:**
- Check GitHub Actions for build errors
- Verify branch is main (or configured Pages branch)
- Ensure Jekyll front matter is correct (`---` delimiters)

**Styles Not Applying:**
- Check SCSS syntax in `_sass/custom.scss`
- Verify import order in `assets/css/main.scss`
- Clear browser cache

**Images Not Displaying:**
- Verify image file is committed and pushed
- Check file path spelling and case sensitivity
- Ensure image is in root directory or correct subdirectory

**Font Not Loading:**
- Verify `TAYBigBirdRegular.woff2` exists in `assets/fonts/`
- Check font-face declaration in `_sass/custom.scss`
- Confirm font path is correct: `url('../assets/fonts/...')`

## Resources

- **Jekyll Documentation**: https://jekyllrb.com/docs/
- **Minima Theme**: https://github.com/jekyll/minima
- **GitHub Pages Docs**: https://docs.github.com/en/pages
- **GFM Spec**: https://github.github.com/gfm/

## Version History

- Current state: Simple one-page portfolio
- Recent updates include custom font integration and style refinements
- Site has been iteratively improved based on commit history

---

**Last Updated**: 2026-01-15
**Maintained By**: AI assistants working with Jamie Martin
**Purpose**: Guide for AI-assisted development and maintenance
