/**
 * Audio Service - Centralized audio management with Singleton pattern
 * 
 * Solves the issue of multiple AudioContext instances being created,
 * which causes audio to stop working after ~10 scans on tablets/mobile.
 */

class AudioService {
  private audioContext: AudioContext | null = null;
  private lastUsed: number = 0;
  private cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
  private isInitialized: boolean = false;

  constructor() {
    // Initialize on first user interaction (required by mobile browsers)
    if (typeof window !== 'undefined') {
      const initOnInteraction = () => {
        this.ensureContext();
        document.removeEventListener('click', initOnInteraction);
        document.removeEventListener('touchstart', initOnInteraction);
      };
      document.addEventListener('click', initOnInteraction, { once: true });
      document.addEventListener('touchstart', initOnInteraction, { once: true });
    }
  }

  private ensureContext(): AudioContext {
    // Create new context if needed
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.isInitialized = true;
    }

    // Resume if suspended (common on mobile after tab switch)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(console.error);
    }

    this.lastUsed = Date.now();
    this.scheduleCleanup();

    return this.audioContext;
  }

  private scheduleCleanup(): void {
    // Clear existing timeout
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
    }

    // Close context after 5 minutes of inactivity to free resources
    this.cleanupTimeout = setTimeout(() => {
      if (this.audioContext && Date.now() - this.lastUsed > 5 * 60 * 1000) {
        this.audioContext.close().catch(console.error);
        this.audioContext = null;
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Play a short success beep (single tone)
   * Used for: product scans, bin scans, verification confirmations
   */
  playSuccessBeep(): void {
    try {
      const ctx = this.ensureContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      // Volume at maximum (1.0) for warehouse environments
      gainNode.gain.setValueAtTime(1.0, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);

      // Clean up oscillator after it stops
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
      };
    } catch (error) {
      console.error('Error playing success beep:', error);
    }
  }

  /**
   * Play an error beep (triple beep, lower frequency, more distinctive)
   * Used for: error overlays, failed operations, product not found
   */
  playErrorBeep(): void {
    try {
      const ctx = this.ensureContext();
      
      // Triple beep for distinctive error sound in noisy environments
      for (let i = 0; i < 3; i++) {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Lower frequency (400Hz) + square wave = more urgent/penetrating sound
        oscillator.frequency.value = 400;
        oscillator.type = 'square';

        const startTime = ctx.currentTime + (i * 0.15);
        // Volume at maximum (1.0) for warehouse environments
        gainNode.gain.setValueAtTime(1.0, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.1);

        oscillator.onended = () => {
          oscillator.disconnect();
          gainNode.disconnect();
        };
      }
    } catch (error) {
      console.error('Error playing error beep:', error);
    }
  }

  /**
   * Play a success chime (two ascending tones)
   * Used for: success overlays, completion confirmations
   */
  playSuccessChime(): void {
    try {
      const ctx = this.ensureContext();

      // First tone
      const oscillator1 = ctx.createOscillator();
      const gainNode1 = ctx.createGain();

      oscillator1.connect(gainNode1);
      gainNode1.connect(ctx.destination);

      oscillator1.frequency.value = 1200;
      oscillator1.type = 'sine';

      // Volume at maximum (1.0) for warehouse environments
      gainNode1.gain.setValueAtTime(1.0, ctx.currentTime);
      gainNode1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      oscillator1.start(ctx.currentTime);
      oscillator1.stop(ctx.currentTime + 0.4);

      oscillator1.onended = () => {
        oscillator1.disconnect();
        gainNode1.disconnect();
      };

      // Second tone (150ms delay, higher pitch)
      const oscillator2 = ctx.createOscillator();
      const gainNode2 = ctx.createGain();

      oscillator2.connect(gainNode2);
      gainNode2.connect(ctx.destination);

      oscillator2.frequency.value = 1500;
      oscillator2.type = 'sine';

      const startTime = ctx.currentTime + 0.15;
      // Volume at maximum (1.0) for warehouse environments
      gainNode2.gain.setValueAtTime(1.0, startTime);
      gainNode2.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);

      oscillator2.start(startTime);
      oscillator2.stop(startTime + 0.4);

      oscillator2.onended = () => {
        oscillator2.disconnect();
        gainNode2.disconnect();
      };
    } catch (error) {
      console.error('Error playing success chime:', error);
    }
  }
}

// Singleton instance
export const audioService = new AudioService();
