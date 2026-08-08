import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

import { Separator } from "@/components/ui/separator";
import { 
  FolderOpen, 
  Upload, 
  Check, 
  X, 
  RefreshCw, 
  FileText,
  AlertTriangle,
  Play
} from "lucide-react";
import { toast } from "sonner";
import "@/types/electron.d";

interface BaselineConfig {
  gsproFolderPath: string;
  dpsFilePath: string;
  settingsFilePath: string;
  enabled: boolean;
  hasDpsFile: boolean;
  hasSettingsFile: boolean;
  isWatching: boolean;
  proteeConfigPath?: string;
  resolvedProteeConfigPath?: string;
  proteeConfigFound?: boolean;
}

interface AppRestoreSettingsProps {
  isElectron: boolean;
}

export function AppRestoreSettings({ isElectron }: AppRestoreSettingsProps) {
  const [config, setConfig] = useState<BaselineConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [gsproRunning, setGsproRunning] = useState(false);


  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [isElectron]);

  // Listen for GSPro events
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    const cleanupClosed = window.electronAPI.onGsproClosed(() => {
      toast.info("GSPro closed - restoring app settings...");
      setGsproRunning(false);
    });

    const cleanupRestored = window.electronAPI.onBaselineRestored((results) => {
      const allSuccess = results.every(r => r.success);
      if (allSuccess) {
        toast.success("App settings restored successfully!");
      } else {
        const failed = results.filter(r => !r.success);
        toast.warning(`Some items failed to restore: ${failed.map(f => f.file).join(', ')}`);
      }
      loadConfig();
    });

    // Check GSPro status periodically
    const checkInterval = setInterval(async () => {
      if (window.electronAPI) {
        const { isRunning } = await window.electronAPI.isGsproRunning();
        setGsproRunning(isRunning);
      }
    }, 5000);

    return () => {
      cleanupClosed?.();
      cleanupRestored?.();
      clearInterval(checkInterval);
    };
  }, [isElectron]);

  const loadConfig = async () => {
    if (!isElectron || !window.electronAPI) {
      setIsLoading(false);
      return;
    }

    try {
      const cfg = await window.electronAPI.getBaselineConfig();
      setConfig(cfg);
      
      const { isRunning } = await window.electronAPI.isGsproRunning();
      setGsproRunning(isRunning);
    } catch (err) {
      console.error("Failed to load baseline config:", err);
    } finally {
      setIsLoading(false);
    }
  };


  const browseGsproFolder = async () => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.browseGsproFolder();
    if (result.success) {
      toast.success(`GSPro folder set: ${result.folderPath}`);
      loadConfig();
    } else if (!result.canceled) {
      toast.error(`Failed to set folder: ${result.error}`);
    }
  };

  const browseProteeConfig = async () => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.browseProteeConfig();
    if (result.success) {
      toast.success(`ProTee config set: ${result.configPath}`);
      loadConfig();
    } else if (!result.canceled) {
      toast.error(`Failed to set ProTee config: ${result.error}`);
    }
  };

  const resetProteeConfig = async () => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.resetProteeConfigPath();
    if (result.success) {
      toast.success(
        result.found
          ? `Auto-detected: ${result.configPath}`
          : `Reset to auto-detect (not found yet: ${result.configPath})`
      );
      loadConfig();
    }
  };

  const browseBaselineFile = async (fileName: string) => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.browseBaselineFile(fileName);
    if (result.success) {
      toast.success(`Uploaded ${fileName} baseline`);
      loadConfig();
    } else if (!result.canceled) {
      toast.error(`Failed to upload: ${result.error}`);
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.setBaselineEnabled(enabled);
    if (result.success) {
      toast.success(enabled ? "App restore enabled" : "App restore disabled");
      loadConfig();
    }
  };

  const restoreNow = async () => {
    if (!window.electronAPI) return;

    setIsRestoring(true);
    try {
      const result = await window.electronAPI.restoreBaselineNow();
      if (result.success) {
        const allSuccess = result.results?.every(r => r.success);
        if (allSuccess) {
          toast.success("App settings restored!");
        } else {
          const failed = result.results?.filter(r => !r.success) || [];
          toast.warning(`Some items failed: ${failed.map(f => f.file).join(', ')}`);
        }
      } else {
        toast.error(`Restore failed: ${result.error}`);
      }
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isElectron) {
    return (
      <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg">
        <p>App restore settings require the desktop app.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading app restore settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* GSPro Status */}
      <div className="flex items-center justify-between">
        <Label>GSPro Status</Label>
        <Badge variant={gsproRunning ? "default" : "secondary"}>
          {gsproRunning ? (
            <><Play className="h-3 w-3 mr-1" /> Running</>
          ) : (
            "Not Running"
          )}
        </Badge>
      </div>

      {/* Master enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label>Enable App Restore</Label>
          <p className="text-xs text-muted-foreground">
            Restores each customer's own GSPro settings before launch (or the
            baseline files below as a fallback), and re-captures their latest
            settings 3 minutes before their session ends. Nothing runs when
            this is off.
          </p>
        </div>
        <Switch
          checked={config?.enabled || false}
          onCheckedChange={toggleEnabled}
        />
      </div>

      {config?.isWatching && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 p-2 rounded">
          <Check className="h-4 w-4" />
          GSPro process watcher active
        </div>
      )}

      <Separator />

      {/* ===== GSPRO BASELINE FILES SECTION ===== */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          <Label className="text-base font-semibold">GSPro Baseline Files</Label>
        </div>

        {/* GSPro Folder */}
        <div className="space-y-2">
          <Label>GSPro Data Folder</Label>
          <div className="flex gap-2">
            <Input
              value={config?.gsproFolderPath || ''}
              readOnly
              placeholder="Not set - click Browse to select"
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={browseGsproFolder}>
              <FolderOpen className="h-4 w-4 mr-1" />
              Browse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Auto-detected from this PC's user profile (%LOCALAPPDATA%\GSPro). Browse only if this bay stores GSPro elsewhere.
          </p>
        </div>

        {/* ProTee Labs Config file */}
        <div className="space-y-2">
          <Label>ProTee Labs Config File</Label>
          <div className="flex gap-2">
            <Input
              value={config?.proteeConfigPath || config?.resolvedProteeConfigPath || ''}
              readOnly
              placeholder="Auto-detecting..."
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={browseProteeConfig}>
              <FolderOpen className="h-4 w-4 mr-1" />
              Browse
            </Button>
            <Button variant="ghost" size="sm" onClick={resetProteeConfig}>
              Auto
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {config?.proteeConfigFound
              ? "Found on this PC — startup screen restore will work."
              : "Not found yet. Auto-detects %APPDATA%\\ProTeeUnited\\Configs\\Config; browse if this PC differs."}
          </p>
        </div>

        {/* Baseline Files */}
        <div className="space-y-3">
          {/* dpsV2x3.gss */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">dpsV2x3.gss</p>
                <p className="text-xs text-muted-foreground">Driver/Club settings</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {config?.hasDpsFile ? (
                <Badge variant="secondary" className="text-green-600 bg-green-500/10">
                  <Check className="h-3 w-3 mr-1" /> Uploaded
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-yellow-600 bg-yellow-500/10">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Not Set
                </Badge>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => browseBaselineFile('dpsV2x3.gss')}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
            </div>
          </div>

          {/* Settings.vgs */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Settings.vgs</p>
                <p className="text-xs text-muted-foreground">General GSPro settings</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {config?.hasSettingsFile ? (
                <Badge variant="secondary" className="text-green-600 bg-green-500/10">
                  <Check className="h-3 w-3 mr-1" /> Uploaded
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-yellow-600 bg-yellow-500/10">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Not Set
                </Badge>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => browseBaselineFile('Settings.vgs')}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Restore Button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={restoreNow}
        disabled={isRestoring || (!config?.hasDpsFile && !config?.hasSettingsFile)}
      >
        {isRestoring ? (
          <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Restoring...</>
        ) : (
          <><RefreshCw className="h-4 w-4 mr-2" /> Restore Now</>
        )}
      </Button>

      {/* Info */}
      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg space-y-1">
        <p><strong>How it works:</strong></p>
        <ol className="list-decimal list-inside space-y-1">
          <li><strong>Before GSPro launches</strong> — if the customer has their own saved settings, we restore those. If not (or it's a walk-in), we apply the baseline files uploaded here.</li>
          <li><strong>3 minutes before session end</strong> — we capture the customer's current <code>dpsV2x3.gss</code> and <code>Settings.vgs</code> and upload them, overwriting whatever they had before. This runs every session, whether they changed anything or not.</li>
          <li><strong>On GSPro close</strong> — nothing. No baseline sweep, no capture. Range CSV upload still runs (separate system).</li>
        </ol>
        <p className="pt-2"><strong>Setup:</strong> Configure GSPro with your default settings + Guest players, then upload <code>dpsV2x3.gss</code> and <code>Settings.vgs</code> below. New/anonymous customers get this baseline; returning customers get their own snapshot.</p>
      </div>
    </div>
  );
}
