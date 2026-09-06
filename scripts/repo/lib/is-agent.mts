/*
 * Inlined from Socket Lib's env/agents and std-env 4.2.0 agent detection.
 * MIT License
 * Copyright (c) 2024 Socket Inc
 * Copyright (c) Pooya Parsa <pooya@pi0.io>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import process from 'node:process'

const agentKeys = [
  'AI_AGENT',
  'AUGMENT_AGENT',
  'CLAUDE_CODE',
  'CLAUDECODE',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'CURSOR_AGENT',
  'GEMINI_CLI',
  'GOOSE_PROVIDER',
  'JUNIE_DATA',
  'JUNIE_SHIM_PATH',
  'OPENCODE',
  'REPL_ID',
]
let detected: boolean | undefined

export function isAgent(): boolean {
  if (detected === undefined) {
    const env = process.env
    detected =
      agentKeys.some(key => Boolean(env[key])) ||
      /\.pi[\\/]agent/.test(env.PATH || '') ||
      /devin/.test(env.EDITOR || '') ||
      (!process.stdout.isTTY && /kiro/.test(env.TERM_PROGRAM || ''))
  }
  return detected
}
