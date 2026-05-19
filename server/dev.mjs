import { spawn } from 'node:child_process'
import net from 'node:net'

const AI_PROXY_PORT = Number(process.env.AI_PROXY_PORT || 8787)

const children = []

const proxyRunning = await isPortOpen(AI_PROXY_PORT)

if (proxyRunning) {
  console.log(`AI proxy already listening on http://127.0.0.1:${AI_PROXY_PORT}`)
} else {
  children.push(spawnProcess('node', ['server/ollamaProxy.mjs'], 'api'))
}

children.push(spawnProcess('node_modules/.bin/vite', process.argv.slice(2), 'vite'))

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) {
      if (!child.killed) child.kill(signal)
    }
    process.exit(0)
  })
}

function spawnProcess(command, args, label) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
  })

  child.on('exit', (code, signal) => {
    if (signal) return
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`)
    }
  })

  return child
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(500)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}
