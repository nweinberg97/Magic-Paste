/**
 * The handful of Chrome extension APIs Magic Paste uses.
 *
 * Declared locally instead of pulling in @types/chrome: the surface is small,
 * and keeping it explicit documents exactly which privileged APIs we touch.
 */
declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    }
    interface StorageChange {
      oldValue?: unknown;
      newValue?: unknown;
    }
    const sync: StorageArea;
    const local: StorageArea;
    const onChanged: {
      addListener(callback: (changes: Record<string, StorageChange>, areaName: 'sync' | 'local' | 'session' | 'managed') => void): void;
    };
  }

  namespace runtime {
    const id: string;
    function getURL(path: string): string;
    function getManifest(): { version: string };
    const onInstalled: {
      addListener(callback: (details: { reason: 'install' | 'update' | 'chrome_update' | 'shared_module_update' }) => void): void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
    }
    function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function create(properties: { url: string }): Promise<Tab>;
  }
}
