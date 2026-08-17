export class UnsupportedPlatformOperation extends Error {
  constructor(operation: string) {
    super(`Unsupported platform operation: ${operation}`)
    this.name = 'UnsupportedPlatformOperation'
  }
}
