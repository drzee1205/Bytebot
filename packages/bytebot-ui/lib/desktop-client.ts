/**
 * Desktop Client for communicating with external bytebotd service
 * This handles all desktop interactions through HTTP API calls
 */

export interface DesktopAction {
  action: string
  [key: string]: any
}

export interface DesktopResponse {
  success: boolean
  data?: any
  error?: string
}

export interface Coordinates {
  x: number
  y: number
}

export interface ClickMouseParams {
  coordinates?: Coordinates
  button?: 'left' | 'right' | 'middle'
  clickCount?: number
}

export interface TypeTextParams {
  text: string
  isSensitive?: boolean
}

export interface MoveMouseParams {
  coordinates: Coordinates
}

export interface ApplicationParams {
  application: 'firefox' | 'vscode' | 'terminal' | 'directory' | 'desktop'
}

export class DesktopClient {
  private baseUrl: string
  private timeout: number

  constructor(baseUrl: string, timeout: number = 30000) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.timeout = timeout
  }

  /**
   * Execute a generic desktop action
   */
  async executeAction(action: DesktopAction): Promise<DesktopResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/computer-use`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(action),
        signal: AbortSignal.timeout(this.timeout)
      })

      if (!response.ok) {
        throw new Error(`Desktop service error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error: any) {
      console.error('Desktop client error:', error)
      return { 
        success: false, 
        error: error.message || 'Unknown desktop service error' 
      }
    }
  }

  /**
   * Take a screenshot of the desktop
   */
  async screenshot(): Promise<DesktopResponse> {
    const result = await this.executeAction({ action: 'screenshot' })
    
    if (result.success && result.data) {
      // Return image data in the expected format
      return {
        success: true,
        data: [{
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: result.data
          }
        }]
      }
    }
    
    return result
  }

  /**
   * Get current cursor position
   */
  async getCursorPosition(): Promise<DesktopResponse> {
    return await this.executeAction({ action: 'cursor_position' })
  }

  /**
   * Move mouse to specified coordinates
   */
  async moveMouse(params: MoveMouseParams): Promise<DesktopResponse> {
    return await this.executeAction({
      action: 'move_mouse',
      coordinate: params.coordinates
    })
  }

  /**
   * Click mouse at specified coordinates or current position
   */
  async clickMouse(params: ClickMouseParams): Promise<DesktopResponse> {
    const action: DesktopAction = {
      action: 'click_mouse',
      button: params.button || 'left',
      clickCount: params.clickCount || 1
    }

    if (params.coordinates) {
      action.coordinate = params.coordinates
    }

    const result = await this.executeAction(action)
    
    // Always take a screenshot after clicking to show the result
    if (result.success) {
      const screenshot = await this.screenshot()
      if (screenshot.success) {
        return {
          success: true,
          data: [
            { type: 'text', text: `Clicked ${params.button || 'left'} button${params.coordinates ? ` at (${params.coordinates.x}, ${params.coordinates.y})` : ' at current position'}` },
            ...screenshot.data
          ]
        }
      }
    }
    
    return result
  }

  /**
   * Type text at current cursor position
   */
  async typeText(params: TypeTextParams): Promise<DesktopResponse> {
    const result = await this.executeAction({
      action: 'type_text',
      text: params.text,
      isSensitive: params.isSensitive || false
    })

    // Take screenshot after typing to show the result
    if (result.success) {
      const screenshot = await this.screenshot()
      if (screenshot.success) {
        return {
          success: true,
          data: [
            { 
              type: 'text', 
              text: params.isSensitive 
                ? 'Typed sensitive text (hidden)' 
                : `Typed: "${params.text}"` 
            },
            ...screenshot.data
          ]
        }
      }
    }

    return result
  }

  /**
   * Press specific keys
   */
  async pressKeys(keys: string[]): Promise<DesktopResponse> {
    return await this.executeAction({
      action: 'press_keys',
      keys
    })
  }

  /**
   * Scroll in specified direction
   */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number = 3): Promise<DesktopResponse> {
    return await this.executeAction({
      action: 'scroll',
      direction,
      amount
    })
  }

  /**
   * Switch to or open an application
   */
  async switchApplication(params: ApplicationParams): Promise<DesktopResponse> {
    const result = await this.executeAction({
      action: 'application',
      application: params.application
    })

    // Take screenshot after switching applications
    if (result.success) {
      // Wait a moment for the application to load
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const screenshot = await this.screenshot()
      if (screenshot.success) {
        return {
          success: true,
          data: [
            { type: 'text', text: `Switched to ${params.application}` },
            ...screenshot.data
          ]
        }
      }
    }

    return result
  }

  /**
   * Wait for specified duration
   */
  async wait(duration: number): Promise<DesktopResponse> {
    return await this.executeAction({
      action: 'wait',
      duration
    })
  }

  /**
   * Read file from the desktop
   */
  async readFile(path: string): Promise<DesktopResponse> {
    return await this.executeAction({
      action: 'read_file',
      path
    })
  }

  /**
   * Write file to the desktop
   */
  async writeFile(path: string, content: string): Promise<DesktopResponse> {
    return await this.executeAction({
      action: 'write_file',
      path,
      content
    })
  }

  /**
   * Check if desktop service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch (error) {
      console.error('Desktop service health check failed:', error)
      return false
    }
  }

  /**
   * Get desktop service status and information
   */
  async getStatus(): Promise<DesktopResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`)
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Failed to get desktop service status' 
      }
    }
  }
}
