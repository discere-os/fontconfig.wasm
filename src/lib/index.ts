/**
 * @module Fontconfig WASM
 * TypeScript-first Fontconfig library for WebAssembly
 */

export default class FontconfigWASM {
  private module: any = null
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return
    
    // Load WASM module
    this.module = await this.loadWASM()
    this.initialized = true
  }

  private async loadWASM(): Promise<any> {
    // Try local build first
    const localPaths = [
      './../../install/wasm/fontconfig-main.js',
      './../../install/wasm/fontconfig-release.js',
    ]

    for (const path of localPaths) {
      try {
        const modulePath = new URL(path, import.meta.url).href
        const mod = await import(modulePath)
        return await mod.default()
      } catch (e) {
        continue
      }
    }

    throw new Error('Failed to load fontconfig.wasm')
  }
}
