import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

const DATA_DIR = join(process.cwd(), 'training_data')

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function appendToFile(filename: string, entry: unknown) {
  ensureDataDir()
  const filepath = join(DATA_DIR, filename)
  let container: { version: string; games: unknown[] } = { version: '1.0', games: [] }
  if (existsSync(filepath)) {
    try { container = JSON.parse(readFileSync(filepath, 'utf-8')) } catch { /* corrupt file */ }
  }
  container.games.push(entry)
  writeFileSync(filepath, JSON.stringify(container, null, 2), 'utf-8')
}

function handleSaveGame(req: IncomingMessage, res: ServerResponse) {
  let body = ''
  req.on('data', (chunk: Buffer) => { body += chunk.toString() })
  req.on('end', () => {
    try {
      const { gameRecord, trainingRecord } = JSON.parse(body) as {
        gameRecord: unknown
        trainingRecord: unknown
      }
      appendToFile('game_records.json', gameRecord)
      appendToFile('training_data.json', trainingRecord)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(e) }))
    }
  })
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'training-data-api',
      configureServer(server) {
        server.middlewares.use('/api/save-game', (req, res, next) => {
          if (req.method === 'POST') {
            handleSaveGame(req, res)
          } else {
            next()
          }
        })
      },
    },
  ],
})
