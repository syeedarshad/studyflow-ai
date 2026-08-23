/**
 * StudyFlow AI — AI Provider Service
 * ─────────────────────────────────────────────────────────────
 * High-level provider service for checking provider availability status.
 * Provider credentials are managed server-side only.
 *
 * Attached to: window.ProviderService
 */

'use strict';

const ProviderService = {
  async getProviderStatus(provider = null) {
    try {
      if (window.providerApi?.getProviderStatus) {
        const res = await window.providerApi.getProviderStatus(provider);
        if (res.success && (res.data?.providers || res.data?.provider || res.data)) {
          return res.data;
        }
      }
    } catch (err) {
      console.warn('[ProviderService] getProviderStatus fetch failed:', err);
    }
    return {
      providers: [
        { provider: 'gemini', configured: false, masked_key: null },
        { provider: 'groq', configured: false, masked_key: null }
      ]
    };
  },
};

window.ProviderService = ProviderService;
