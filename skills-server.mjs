#!/usr/bin/env node

/**
 * Claude Code Skills Viewer - Local Server
 *
 * 스킬 목록 조회, 추가, 삭제를 브라우저에서 직접 수행할 수 있는 로컬 서버.
 * 새로고침하면 항상 최신 스킬 상태를 반영합니다.
 *
 * Usage: npx claude-skills-viewer
 *        npx claude-skills-viewer --port 4000
 *        PORT=4000 npx claude-skills-viewer
 * Open:  http://localhost:3333
 */

import { createServer } from 'node:http';
import { readdir, readFile, realpath, stat, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { execSync } from 'node:child_process';

// CLI 인자에서 --port 파싱
function getPort() {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    return parseInt(process.argv[portArgIdx + 1], 10);
  }
  return parseInt(process.env.PORT, 10) || 3333;
}

const PORT = getPort();
const SKILLS_DIR = join(homedir(), '.claude', 'skills');
const AGENTS_DIR = join(homedir(), '.agents', 'skills');
const CONFIG_PATH = join(homedir(), '.claude', 'skills-viewer.json');

// 설정 파일에서 프로젝트 목록 로드/저장
async function loadConfig() {
  try {
    const data = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    return { projects: data.projects || [] };
  } catch { return { projects: [] }; }
}

async function saveConfig() {
  await mkdir(join(homedir(), '.claude'), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify({ projects: [...projectDirs] }, null, 2), 'utf-8');
}

// 프로젝트 경로 목록 (설정 파일에 영속 저장)
const projectDirs = new Set();

// --- Skill loading ---

async function parseSkillMd(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: content };

  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (kv) {
      let val = kv[2].replace(/^["']|["']$/g, '').trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      meta[kv[1]] = val;
    }
  }
  return { meta, body: m[2].trim() };
}

async function loadSkillsFrom(dir, scope) {
  const entries = await readdir(dir).catch(() => []);
  const skills = [];

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    try {
      const resolved = await realpath(join(dir, entry));
      const s = await stat(resolved);
      if (!s.isDirectory()) continue;

      const content = await readFile(join(resolved, 'SKILL.md'), 'utf-8').catch(() => null);
      if (!content) continue;

      const { meta, body } = await parseSkillMd(content);
      skills.push({
        dirName: entry,
        name: meta.name || entry,
        description: meta.description || '',
        version: meta.version || '',
        tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
        category: meta.category || 'general',
        subcategories: Array.isArray(meta.subcategories) ? meta.subcategories : meta.subcategories ? [meta.subcategories] : [],
        charCount: body.length,
        scope,
        body,
      });
    } catch {}
  }
  return skills;
}

async function loadSkills() {
  const projectLoads = [...projectDirs].map(dir =>
    loadSkillsFrom(join(dir, '.claude', 'skills'), dir)
  );
  const [personal, ...projectResults] = await Promise.all([
    loadSkillsFrom(SKILLS_DIR, 'personal'),
    ...projectLoads,
  ]);
  return [...personal, ...projectResults.flat()].sort((a, b) => a.name.localeCompare(b.name));
}

// --- API handlers ---

async function handleDeleteSkill(dirName) {
  const linkPath = join(SKILLS_DIR, dirName);
  const agentPath = join(AGENTS_DIR, dirName);

  await rm(linkPath, { force: true }).catch(() => {});
  await rm(agentPath, { recursive: true, force: true }).catch(() => {});

  return { ok: true };
}

async function handleAddSkill(dirName, content) {
  const agentPath = join(AGENTS_DIR, dirName);
  const linkPath = join(SKILLS_DIR, dirName);

  await mkdir(agentPath, { recursive: true });
  await writeFile(join(agentPath, 'SKILL.md'), content, 'utf-8');

  // Create symlink (absolute path for cross-platform compatibility)
  try {
    await symlink(agentPath, linkPath, 'junction');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }

  return { ok: true };
}

// --- Request body parser ---

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

// --- HTML ---

function getHtml() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Skills Viewer</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <style>
    /* Dracula Dark */
    :root {
      --bg: #282a36; --bg-secondary: #21222c; --bg-tertiary: #343746;
      --border: #44475a; --text: #f8f8f2; --text-secondary: #9ca0b0;
      --text-tertiary: #6272a4; --accent: #8be9fd; --accent-subtle: #8be9fd1a;
      --green: #50fa7b; --orange: #ffb86c; --red: #ff5555; --radius: 8px;
      --purple: #bd93f9; --cyan: #8be9fd;
    }
    /* Minimal Mist */
    @media (prefers-color-scheme: light) {
      :root:not([data-theme="dark"]) {
        --bg: #f7f8fa; --bg-secondary: #eef0f4; --bg-tertiary: #e3e6eb;
        --border: #d5d9e0; --text: #2c3e50; --text-secondary: #5a6a7e;
        --text-tertiary: #9ba8b7; --accent: #4a90d9; --accent-subtle: #4a90d91a;
        --green: #27ae60; --orange: #e67e22; --red: #e74c3c;
        --purple: #8e44ad; --cyan: #17a2b8;
      }
    }
    [data-theme="light"] {
      --bg: #f7f8fa; --bg-secondary: #eef0f4; --bg-tertiary: #e3e6eb;
      --border: #d5d9e0; --text: #2c3e50; --text-secondary: #5a6a7e;
      --text-tertiary: #9ba8b7; --accent: #4a90d9; --accent-subtle: #4a90d91a;
      --green: #27ae60; --orange: #e67e22; --red: #e74c3c;
      --purple: #8e44ad; --cyan: #17a2b8;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.6;
    }
    .header {
      position: sticky; top: 0; z-index: 100;
      background: var(--bg-secondary); border-bottom: 1px solid var(--border);
      padding: 16px 24px; backdrop-filter: blur(12px);
    }
    .header-inner {
      max-width: 1400px; margin: 0 auto;
      display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
    }
    .header h1 {
      font-size: 20px; font-weight: 600; white-space: nowrap;
      display: flex; align-items: center; gap: 8px;
    }
    .header h1 .badge {
      background: var(--accent-subtle); color: var(--accent);
      padding: 2px 10px; border-radius: 20px; font-size: 13px; font-weight: 500;
    }
    .search-box {
      flex: 1; min-width: 200px; max-width: 480px; position: relative;
    }
    .search-box input {
      width: 100%; background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 8px 12px 8px 36px;
      color: var(--text); font-size: 14px; outline: none; transition: border-color 0.2s;
    }
    .search-box input:focus { border-color: var(--accent); }
    .search-box .icon {
      position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
      color: var(--text-tertiary); font-size: 14px;
    }
    .add-btn {
      background: var(--accent-subtle); border: 1px solid var(--accent);
      color: var(--accent); padding: 6px 14px; border-radius: var(--radius);
      font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
    }
    .add-btn:hover { background: var(--accent); color: var(--bg); }
    .theme-btn {
      background: none; border: 1px solid var(--border);
      color: var(--text-secondary); width: 34px; height: 34px;
      border-radius: var(--radius); cursor: pointer; font-size: 16px;
      display: flex; align-items: center; justify-content: center; transition: all 0.15s;
    }
    .theme-btn:hover { border-color: var(--accent); color: var(--accent); }

    .main { max-width: 1400px; margin: 0 auto; padding: 24px; }

    .skills-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px;
    }
    .skill-card {
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden;
      transition: border-color 0.2s, transform 0.15s; cursor: pointer;
    }
    .skill-card:hover { border-color: var(--accent); transform: translateY(-1px); }
    .skill-card.expanded { grid-column: 1 / -1; }
    .skill-card-header { padding: 16px 20px; min-height: 120px; }
    .skill-name {
      font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;
    }
    .skill-name code {
      font-family: 'SF Mono', 'Fira Code', monospace; color: var(--green); font-size: 15px;
    }
    .skill-version {
      font-size: 11px; color: var(--text-tertiary);
      background: var(--bg-tertiary); padding: 1px 6px; border-radius: 4px;
    }
    .scope-badge {
      font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500;
    }
    .scope-badge.personal { background: #388bfd26; color: var(--accent); }
    .scope-badge.project { background: #3fb95026; color: var(--green); }
    .skill-description {
      color: var(--text-secondary); font-size: 13px; margin-top: 8px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .skill-description.empty {
      color: var(--text-tertiary); font-style: italic;
    }
    .skill-card.expanded .skill-description { -webkit-line-clamp: unset; }
    .skill-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
    .tag {
      font-size: 11px; padding: 2px 8px; border-radius: 12px;
      background: var(--bg-tertiary); color: var(--text-secondary);
    }
    .tag.size { background: #d2992233; color: var(--orange); }

    .skill-body {
      display: none; padding: 0 20px 20px;
      border-top: 1px solid var(--border); margin-top: 12px;
    }
    .skill-card.expanded .skill-body { display: block; }
    .skill-body .markdown-content {
      font-size: 14px; line-height: 1.7; max-height: 600px;
      overflow-y: auto; padding-right: 8px;
    }
    .skill-body .markdown-content::-webkit-scrollbar { width: 6px; }
    .skill-body .markdown-content::-webkit-scrollbar-track { background: transparent; }
    .skill-body .markdown-content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .markdown-content h1, .markdown-content h2, .markdown-content h3 {
      margin-top: 20px; margin-bottom: 8px;
      border-bottom: 1px solid var(--border); padding-bottom: 6px;
    }
    .markdown-content h1 { font-size: 20px; }
    .markdown-content h2 { font-size: 17px; }
    .markdown-content h3 { font-size: 15px; border: none; }
    .markdown-content p { margin: 8px 0; }
    .markdown-content code {
      font-family: 'SF Mono', 'Fira Code', monospace;
      background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; font-size: 13px;
    }
    .markdown-content pre {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 12px 16px; overflow-x: auto; margin: 12px 0;
    }
    .markdown-content pre code { background: none; padding: 0; }
    .markdown-content ul, .markdown-content ol { margin: 8px 0; padding-left: 24px; }
    .markdown-content li { margin: 4px 0; }
    .markdown-content table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    .markdown-content th, .markdown-content td {
      border: 1px solid var(--border); padding: 8px 12px; text-align: left; font-size: 13px;
    }
    .markdown-content th { background: var(--bg-tertiary); font-weight: 600; }
    .markdown-content blockquote {
      border-left: 3px solid var(--accent); padding: 4px 16px; margin: 12px 0;
      color: var(--text-secondary); background: var(--bg);
      border-radius: 0 var(--radius) var(--radius) 0;
    }
    .markdown-content a { color: var(--accent); text-decoration: none; }
    .markdown-content a:hover { text-decoration: underline; }

    .no-results { text-align: center; padding: 60px 20px; color: var(--text-tertiary); }
    .no-results .big { font-size: 48px; margin-bottom: 12px; }

    .skill-toolbar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 20px; background: var(--bg);
      border-top: 1px solid var(--border); font-size: 12px; color: var(--text-tertiary);
    }
    .delete-btn {
      background: transparent; border: 1px solid var(--border);
      color: var(--text-tertiary); padding: 4px 10px; border-radius: 4px;
      cursor: pointer; font-size: 12px; transition: all 0.15s;
    }
    .delete-btn:hover { border-color: var(--red); color: var(--red); background: #f8514926; }

    .toast {
      position: fixed; bottom: 24px; left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--bg-tertiary); border: 1px solid var(--border);
      color: var(--text); padding: 12px 24px; border-radius: var(--radius);
      font-size: 14px; z-index: 200; transition: transform 0.3s ease;
      pointer-events: none; max-width: 90vw;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast.error { border-color: var(--red); }

    .dialog-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4);
      z-index: 150; display: flex; align-items: center; justify-content: center;
    }
    .dialog {
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: 12px; padding: 24px; max-width: 520px; width: 90%;
    }
    .dialog h3 { font-size: 16px; margin-bottom: 8px; }
    .dialog p { color: var(--text-secondary); font-size: 14px; margin-bottom: 16px; }
    .dialog code {
      font-family: 'SF Mono', 'Fira Code', monospace;
      background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; font-size: 13px;
    }
    .dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .dialog-actions button {
      padding: 8px 16px; border-radius: 6px; font-size: 13px;
      cursor: pointer; border: 1px solid var(--border); transition: all 0.15s;
    }
    .dialog-actions .cancel-btn { background: var(--bg-tertiary); color: var(--text); }
    .dialog-actions .cancel-btn:hover { border-color: var(--text-tertiary); }
    .dialog-actions .confirm-delete-btn { background: var(--red); border-color: var(--red); color: white; }
    .dialog-actions .confirm-delete-btn:hover { opacity: 0.9; }

    .upload-zone {
      border: 2px dashed var(--border); border-radius: var(--radius);
      padding: 32px 20px; text-align: center; cursor: pointer;
      transition: all 0.2s; margin-bottom: 16px;
    }
    .upload-zone:hover, .upload-zone.dragover {
      border-color: var(--accent); background: var(--accent-subtle);
    }
    .upload-zone .uz-icon { font-size: 32px; margin-bottom: 8px; color: var(--text-tertiary); }
    .upload-zone .uz-label { font-size: 14px; color: var(--text-secondary); }
    .upload-zone .uz-hint { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }
    .upload-preview {
      background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 12px 16px; margin-bottom: 16px; display: none;
    }
    .upload-preview .file-info { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .upload-preview .file-name { font-family: 'SF Mono', 'Fira Code', monospace; color: var(--green); font-size: 13px; }
    .upload-preview .file-size { color: var(--text-tertiary); font-size: 12px; }
    .upload-preview .parsed-name { color: var(--accent); font-size: 13px; }
    .upload-preview .parsed-desc { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
    .skill-name-input {
      width: 100%; background: var(--bg); border: 1px solid var(--border);
      border-radius: 6px; padding: 8px 12px; color: var(--text); font-size: 13px;
      font-family: 'SF Mono', 'Fira Code', monospace; outline: none; margin-bottom: 12px;
    }
    .skill-name-input:focus { border-color: var(--accent); }
    .confirm-add-btn {
      background: var(--accent); border: none; color: var(--bg);
      padding: 8px 20px; border-radius: 6px; font-size: 13px;
      font-weight: 500; cursor: pointer; width: 100%;
    }
    .confirm-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .fav-btn {
      background: none; border: none; cursor: pointer; font-size: 16px;
      color: var(--text-tertiary); padding: 0 2px; line-height: 1;
      transition: color 0.15s, transform 0.15s;
    }
    .fav-btn:hover { color: var(--orange); transform: scale(1.2); }
    .fav-btn.active { color: var(--orange); }
    .fav-filter-btn {
      background: none; border: 1px solid var(--border);
      color: var(--text-secondary); width: 34px; height: 34px;
      border-radius: var(--radius); cursor: pointer; font-size: 16px;
      display: flex; align-items: center; justify-content: center; transition: all 0.15s;
    }
    .fav-filter-btn:hover { border-color: var(--accent); color: var(--accent); }
    .fav-filter-btn.active {
      border-color: var(--accent); color: var(--accent); background: var(--accent-subtle);
    }

    .loading { opacity: 0.5; pointer-events: none; }

    .project-list { margin-bottom: 12px; }
    .project-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: var(--bg);
      border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px;
    }
    .project-item code {
      flex: 1; font-size: 12px; color: var(--green); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
    .project-item .remove-btn {
      background: none; border: none; color: var(--text-tertiary);
      cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px;
      transition: color 0.15s;
    }
    .project-item .remove-btn:hover { color: var(--red); }
    .project-empty {
      color: var(--text-tertiary); font-size: 13px; padding: 16px 0;
      text-align: center;
    }
    .browse-add-btn {
      background: var(--accent-subtle); border: 1px dashed var(--accent);
      color: var(--accent); padding: 8px; border-radius: 6px;
      font-size: 13px; cursor: pointer; width: 100%;
      transition: all 0.15s; margin-bottom: 16px;
    }
    .browse-add-btn:hover { background: var(--accent); color: var(--bg); }

    @media (max-width: 480px) {
      .skills-grid { grid-template-columns: 1fr; }
      .header-inner { flex-direction: column; align-items: stretch; }
      .search-box { max-width: none; }
    }
  </style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <h1>
      Claude Code Skills
      <span class="badge" id="skill-count">0</span>
    </h1>
    <div class="search-box">
      <span class="icon">&#128269;</span>
      <input type="text" id="search" placeholder="스킬 검색 (이름, 설명, 태그...)" autofocus>
    </div>
    <button class="fav-filter-btn" id="fav-filter-btn" onclick="toggleFavFilter()" title="즐겨찾기만 보기">☆</button>
    <button class="add-btn" onclick="showProjectDialog()">+ 프로젝트</button>
    <button class="add-btn" onclick="showAddDialog()">+ 추가</button>
    <button class="theme-btn" id="theme-btn" onclick="toggleTheme()"></button>
  </div>
</div>

<div class="main">
  <div class="skills-grid" id="skills-grid"></div>
  <div class="no-results" id="no-results" style="display:none">
    <div class="big">&#128270;</div>
    <div>검색 결과가 없습니다</div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
let skills = [];
let searchQuery = '';
let expandedCard = null;
let favorites = new Set(JSON.parse(localStorage.getItem('skills-viewer-favorites') || '[]'));
let showFavoritesOnly = false;

// --- API ---
async function fetchSkills() {
  const res = await fetch('/api/skills');
  skills = await res.json();
  document.getElementById('skill-count').textContent = skills.length + '개';
  render();
}

async function apiDelete(dirName) {
  const res = await fetch('/api/skills/' + encodeURIComponent(dirName), { method: 'DELETE' });
  return res.json();
}

async function apiAdd(dirName, content) {
  const res = await fetch('/api/skills/' + encodeURIComponent(dirName), {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: content,
  });
  return res.json();
}

// --- Search ---
const searchEl = document.getElementById('search');
searchEl.addEventListener('input', (e) => { searchQuery = e.target.value.toLowerCase(); render(); });

// --- Favorites ---
function saveFavorites() {
  localStorage.setItem('skills-viewer-favorites', JSON.stringify([...favorites]));
}

function toggleFavorite(dirName) {
  if (favorites.has(dirName)) favorites.delete(dirName);
  else favorites.add(dirName);
  saveFavorites();
  render();
}

function toggleFavFilter() {
  showFavoritesOnly = !showFavoritesOnly;
  const btn = document.getElementById('fav-filter-btn');
  btn.textContent = showFavoritesOnly ? '\\u2605' : '\\u2606';
  btn.classList.toggle('active', showFavoritesOnly);
  render();
}

// --- Render ---
function render() {
  const grid = document.getElementById('skills-grid');
  const noResults = document.getElementById('no-results');

  const filtered = skills.filter(s => {
    if (showFavoritesOnly && !favorites.has(s.dirName)) return false;
    if (!searchQuery) return true;
    const haystack = [s.name, s.dirName, s.description, ...s.tags, s.category, ...s.subcategories].join(' ').toLowerCase();
    return haystack.includes(searchQuery);
  });

  if (filtered.length === 0) { grid.innerHTML = ''; noResults.style.display = 'block'; return; }

  noResults.style.display = 'none';
  grid.innerHTML = filtered.map(s => {
    const expanded = expandedCard === s.dirName;
    const isFav = favorites.has(s.dirName);
    return '<div class="skill-card ' + (expanded ? 'expanded' : '') + '" data-name="' + s.dirName + '">' +
      '<div class="skill-card-header" onclick="toggleCard(\\'' + s.dirName + '\\')">' +
        '<div class="skill-name"><code>/' + s.dirName + '</code>' +
          (s.version ? '<span class="skill-version">v' + s.version + '</span>' : '') +
          '<span class="scope-badge ' + s.scope + '">' + (s.scope === 'personal' ? 'Personal' : 'Project') + '</span>' +
          '<button class="fav-btn' + (isFav ? ' active' : '') + '" onclick="event.stopPropagation(); toggleFavorite(\\'' + s.dirName + '\\')" title="즐겨찾기">' + (isFav ? '\\u2605' : '\\u2606') + '</button>' +
        '</div>' +
        '<div class="skill-description' + (s.description ? '' : ' empty') + '">' + (s.description ? escapeHtml(s.description) : '설명이 없습니다') + '</div>' +
        (s.scope !== 'personal' ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + escapeHtml(s.scope) + '</div>' : '') +
        '<div class="skill-meta">' +
          '<span class="tag size">' + Math.round(s.charCount / 1000) + 'K chars</span>' +
          s.tags.slice(0, 5).map(t => '<span class="tag">' + t + '</span>').join('') +
          (s.tags.length > 5 ? '<span class="tag">+' + (s.tags.length - 5) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="skill-body"><div class="markdown-content" id="md-' + s.dirName + '"></div></div>' +
      '<div class="skill-toolbar">' +
        '<span>~' + Math.round(s.charCount / 4) + ' tokens</span>' +
        '<span style="flex:1"></span>' +
        '<button class="delete-btn" onclick="event.stopPropagation(); confirmDelete(\\'' + s.dirName + '\\')">삭제</button>' +
      '</div>' +
    '</div>';
  }).join('');

  if (expandedCard) renderMarkdown(expandedCard);
}

function escapeHtml(str) {
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

function toggleCard(dirName) {
  expandedCard = expandedCard === dirName ? null : dirName;
  render();
  if (expandedCard) {
    setTimeout(() => {
      const card = document.querySelector('.skill-card[data-name="' + expandedCard + '"]');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }
}

function renderMarkdown(dirName) {
  const el = document.getElementById('md-' + dirName);
  if (!el || el.dataset.rendered) return;
  const skill = skills.find(s => s.dirName === dirName);
  if (skill) {
    el.innerHTML = marked.parse(skill.body);
    el.dataset.rendered = '1';
  }
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// --- Delete ---
function confirmDelete(dirName) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML =
    '<div class="dialog">' +
      '<h3>스킬 삭제</h3>' +
      '<p><code>/' + dirName + '</code> 스킬을 삭제하시겠습니까?<br>' +
      '<span style="font-size:12px;color:var(--text-tertiary)">심볼릭 링크와 원본 파일이 모두 제거됩니다.</span></p>' +
      '<div class="dialog-actions">' +
        '<button class="cancel-btn" onclick="this.closest(\\'.dialog-overlay\\').remove()">취소</button>' +
        '<button class="confirm-delete-btn" id="del-btn">삭제</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#del-btn').addEventListener('click', async () => {
    overlay.querySelector('.dialog').classList.add('loading');
    try {
      await apiDelete(dirName);
      overlay.remove();
      if (expandedCard === dirName) expandedCard = null;
      await fetchSkills();
      showToast('/' + dirName + ' 삭제 완료');
    } catch (e) {
      overlay.remove();
      showToast('삭제 실패: ' + e.message, true);
    }
  });
}

// --- Add ---
let pendingContent = '';

function showAddDialog() {
  pendingContent = '';
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML =
    '<div class="dialog">' +
      '<h3>스킬 추가</h3>' +
      '<p>SKILL.md 파일을 업로드하세요</p>' +
      '<div class="upload-zone" id="upload-zone">' +
        '<div class="uz-icon">&#128196;</div>' +
        '<div class="uz-label">클릭하거나 파일을 드래그하세요</div>' +
        '<div class="uz-hint">.md 파일</div>' +
        '<input type="file" accept=".md" style="display:none" id="file-input">' +
      '</div>' +
      '<div class="upload-preview" id="upload-preview">' +
        '<div class="file-info"><span class="file-name" id="preview-filename"></span><span class="file-size" id="preview-filesize"></span></div>' +
        '<div class="parsed-name" id="preview-name"></div>' +
        '<div class="parsed-desc" id="preview-desc"></div>' +
      '</div>' +
      '<label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">스킬 디렉토리 이름 (슬래시 커맨드에 사용됨)</label>' +
      '<input type="text" class="skill-name-input" id="add-skill-name" placeholder="예: my-awesome-skill">' +
      '<button class="confirm-add-btn" id="confirm-add-btn" disabled>스킬 추가</button>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  const zone = overlay.querySelector('#upload-zone');
  const fileInput = overlay.querySelector('#file-input');
  const nameInput = overlay.querySelector('#add-skill-name');
  const addBtn = overlay.querySelector('#confirm-add-btn');

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0], overlay); });
  fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0], overlay); });
  nameInput.addEventListener('input', () => { addBtn.disabled = !(pendingContent && nameInput.value.trim()); });

  addBtn.addEventListener('click', async () => {
    const dirName = nameInput.value.trim();
    if (!dirName || !pendingContent) return;
    addBtn.disabled = true;
    addBtn.textContent = '추가 중...';
    try {
      await apiAdd(dirName, pendingContent);
      overlay.remove();
      await fetchSkills();
      showToast('/' + dirName + ' 추가 완료');
    } catch (e) {
      addBtn.disabled = false;
      addBtn.textContent = '스킬 추가';
      showToast('추가 실패: ' + e.message, true);
    }
  });
}

function handleFile(file, overlay) {
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingContent = e.target.result;
    const meta = parseFrontmatter(pendingContent);

    const preview = overlay.querySelector('#upload-preview');
    preview.style.display = 'block';
    overlay.querySelector('#preview-filename').textContent = file.name;
    overlay.querySelector('#preview-filesize').textContent = '(' + (file.size / 1024).toFixed(1) + 'KB)';
    overlay.querySelector('#preview-name').textContent = meta.name ? '이름: ' + meta.name : '';
    overlay.querySelector('#preview-desc').textContent = meta.description || '';

    const nameInput = overlay.querySelector('#add-skill-name');
    if (meta.name && !nameInput.value) nameInput.value = meta.name;
    overlay.querySelector('#confirm-add-btn').disabled = !(pendingContent && nameInput.value.trim());
  };
  reader.readAsText(file);
}

function parseFrontmatter(content) {
  const m = content.match(/^---\\n([\\s\\S]*?)\\n---/);
  if (!m) return {};
  const meta = {};
  for (const line of m[1].split('\\n')) {
    const kv = line.match(/^(\\w[\\w-]*)\\s*:\\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return meta;
}

// --- Project management ---
let projects = [];

async function fetchProjects() {
  const res = await fetch('/api/projects');
  projects = await res.json();
}

function showProjectDialog() {
  let pending = [...projects];

  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML =
    '<div class="dialog">' +
      '<h3>프로젝트 스킬 관리</h3>' +
      '<p>프로젝트를 등록하면 해당 경로의 <code>.claude/skills/</code> 스킬을 함께 표시합니다.</p>' +
      '<div class="project-list" id="pending-list"></div>' +
      '<button class="browse-add-btn" id="browse-add-btn">+ 폴더 선택하여 추가</button>' +
      '<div class="dialog-actions">' +
        '<button class="cancel-btn" id="proj-cancel-btn">취소</button>' +
        '<button class="confirm-add-btn" id="proj-confirm-btn" style="width:auto;padding:8px 20px">확인</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  function renderList() {
    const list = overlay.querySelector('#pending-list');
    if (pending.length === 0) {
      list.innerHTML = '<div class="project-empty">등록된 프로젝트가 없습니다</div>';
      return;
    }
    list.innerHTML = pending.map((p, i) =>
      '<div class="project-item">' +
        '<code title="' + escapeHtml(p) + '">' + escapeHtml(p) + '</code>' +
        '<button class="remove-btn" data-idx="' + i + '">&times;</button>' +
      '</div>'
    ).join('');
    list.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pending.splice(parseInt(btn.dataset.idx), 1);
        renderList();
      });
    });
  }

  renderList();

  overlay.querySelector('#browse-add-btn').addEventListener('click', async () => {
    const btn = overlay.querySelector('#browse-add-btn');
    btn.disabled = true; btn.textContent = '폴더 선택 중...';
    try {
      const res = await fetch('/api/pick-folder');
      const data = await res.json();
      if (data.path && !pending.includes(data.path)) {
        pending.push(data.path);
        renderList();
      } else if (data.path) {
        showToast('이미 추가된 경로입니다', true);
      }
    } catch {}
    btn.disabled = false; btn.textContent = '+ 폴더 선택하여 추가';
  });

  overlay.querySelector('#proj-cancel-btn').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#proj-confirm-btn').addEventListener('click', async () => {
    const btn = overlay.querySelector('#proj-confirm-btn');
    btn.disabled = true; btn.textContent = '적용 중...';

    // 제거된 프로젝트 삭제
    for (const p of projects) {
      if (!pending.includes(p)) {
        await fetch('/api/projects', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: p }),
        });
      }
    }
    // 새로 추가된 프로젝트 등록
    let errors = [];
    for (const p of pending) {
      if (!projects.includes(p)) {
        const res = await fetch('/api/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: p }),
        });
        if (!res.ok) {
          const data = await res.json();
          errors.push(data.error);
        }
      }
    }

    overlay.remove();
    await fetchProjects();
    await fetchSkills();

    if (errors.length) showToast(errors.join('\\n'), true);
    else showToast('프로젝트 목록이 업데이트되었습니다');
  });
}

// --- Keyboard ---
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchEl && !document.activeElement.closest('.dialog')) {
    e.preventDefault(); searchEl.focus();
  }
  if (e.key === 'Escape') {
    const dialog = document.querySelector('.dialog-overlay');
    if (dialog) { dialog.remove(); return; }
    if (expandedCard) { expandedCard = null; render(); }
    else searchEl.blur();
  }
});

// --- Theme (system / light / dark) ---
function applyTheme(mode) {
  const btn = document.getElementById('theme-btn');
  if (mode === 'system') {
    document.documentElement.removeAttribute('data-theme');
    btn.textContent = '\\u{1F4BB}';
  } else {
    document.documentElement.setAttribute('data-theme', mode);
    btn.textContent = mode === 'light' ? '\\u{1F319}' : '\\u{2600}\\u{FE0F}';
  }
}

function toggleTheme() {
  const stored = localStorage.getItem('skills-viewer-theme') || 'system';
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(stored) + 1) % 3];
  if (next === 'system') localStorage.removeItem('skills-viewer-theme');
  else localStorage.setItem('skills-viewer-theme', next);
  applyTheme(next);
}

applyTheme(localStorage.getItem('skills-viewer-theme') || 'system');

// --- Init ---
fetchProjects().then(() => fetchSkills());
<\/script>
</body>
</html>`;
}

// --- HTTP Server ---

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers (for local dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // GET / — serve HTML
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHtml());
      return;
    }

    // GET /api/skills — list all skills
    if (req.method === 'GET' && url.pathname === '/api/skills') {
      const skills = await loadSkills();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(skills));
      return;
    }

    // DELETE /api/skills/:name — delete a skill
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/skills/')) {
      const dirName = decodeURIComponent(url.pathname.slice('/api/skills/'.length));
      const result = await handleDeleteSkill(dirName);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // PUT /api/skills/:name — add a skill (body = SKILL.md content)
    if (req.method === 'PUT' && url.pathname.startsWith('/api/skills/')) {
      const dirName = decodeURIComponent(url.pathname.slice('/api/skills/'.length));
      const content = await readBody(req);
      const result = await handleAddSkill(dirName, content);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // GET /api/pick-folder — open native folder picker
    if (req.method === 'GET' && url.pathname === '/api/pick-folder') {
      try {
        let selected = '';
        const p = process.platform;
        if (p === 'darwin') {
          selected = execSync(
            `osascript -e 'POSIX path of (choose folder with prompt "프로젝트 폴더를 선택하세요")'`,
            { encoding: 'utf-8', timeout: 60000 }
          ).trim().replace(/\/$/, '');
        } else if (p === 'win32') {
          selected = execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select project folder'; if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}"`,
            { encoding: 'utf-8', timeout: 60000 }
          ).trim();
        } else {
          selected = execSync(
            `zenity --file-selection --directory --title="프로젝트 폴더 선택" 2>/dev/null || kdialog --getexistingdirectory ~ 2>/dev/null`,
            { encoding: 'utf-8', timeout: 60000 }
          ).trim();
        }
        if (!selected) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ cancelled: true }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ path: selected }));
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ cancelled: true }));
      }
      return;
    }

    // GET /api/projects — list registered project paths
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([...projectDirs]));
      return;
    }

    // PUT /api/projects — add a project path (body = JSON { path })
    if (req.method === 'PUT' && url.pathname === '/api/projects') {
      const { path: dirPath } = JSON.parse(await readBody(req));
      const skillsPath = join(dirPath, '.claude', 'skills');
      const s = await stat(skillsPath).catch(() => null);
      if (!s || !s.isDirectory()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `${skillsPath} 경로에 스킬이 없습니다` }));
        return;
      }
      projectDirs.add(dirPath);
      await saveConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, projects: [...projectDirs] }));
      return;
    }

    // DELETE /api/projects — remove a project path (body = JSON { path })
    if (req.method === 'DELETE' && url.pathname === '/api/projects') {
      const { path: dirPath } = JSON.parse(await readBody(req));
      projectDirs.delete(dirPath);
      await saveConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, projects: [...projectDirs] }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

const MAX_PORT_RETRIES = 5;
let currentPort = PORT;
let retries = 0;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    retries++;
    if (retries > MAX_PORT_RETRIES) {
      console.error(`\n  포트 ${PORT}~${currentPort} 모두 사용 중입니다.`);
      console.error(`  다른 포트를 지정해주세요: npx claude-skills-viewer --port <포트번호>\n`);
      process.exit(1);
    }
    currentPort++;
    console.warn(`  포트 ${currentPort - 1}이(가) 사용 중입니다. ${currentPort}번으로 시도합니다...`);
    server.listen(currentPort);
  } else {
    console.error(err);
    process.exit(1);
  }
});

server.on('listening', () => {
  console.log(`\n  Skills Viewer running at http://localhost:${currentPort}\n`);
  const url = `http://localhost:${currentPort}`;
  import('node:child_process').then(({ exec }) => {
    const cmd = process.platform === 'win32' ? `start ${url}`
              : process.platform === 'darwin' ? `open ${url}`
              : `xdg-open ${url}`;
    exec(cmd);
  });
});

// 설정 파일에서 프로젝트 목록 로드 후 서버 시작
loadConfig().then(config => {
  for (const p of config.projects) projectDirs.add(p);
  server.listen(currentPort);
});
