import { useState, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { usePricing } from "@/hooks/usePricing";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

interface ImportRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  membershipTier: string;
  status: 'pending' | 'success' | 'error' | 'skipped';
  message?: string;
}



export default function AdminCustomerImport() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const { pricing, defaultTier } = usePricing();
  const walkInTier = defaultTier?.tier ?? 'visitor';
  const validTiers = pricing.map((t) => t.tier.toLowerCase());
  const [csvData, setCsvData] = useState<ImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importComplete, setImportComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string): ImportRow[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    // Skip header row
    const dataRows = lines.slice(1);
    
    return dataRows.map(line => {
      // Handle CSV with quotes
      const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const cleanValues = values.map(v => v.replace(/^"|"$/g, '').trim());
      
      const [firstName = '', lastName = '', email = '', phone = '', tierRaw = ''] = cleanValues;
      const tier = tierRaw.toLowerCase();
      
      return {
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone,
        membershipTier: validTiers.includes(tier) ? tier : walkInTier,
        status: 'pending' as const
      };
    }).filter(row => row.email && row.email.includes('@'));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setCsvData(parsed);
      setImportComplete(false);
      setImportProgress(0);
      toast.success(`Parsed ${parsed.length} valid rows from CSV`);
    };
    reader.readAsText(file);
  };

  const importCustomers = async () => {
    if (csvData.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    
    const updatedData = [...csvData];
    let successCount = 0;
    let errorCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < updatedData.length; i++) {
      const row = updatedData[i];
      
      try {
        const { data, error } = await supabase.functions.invoke('import-customer', {
          body: {
            email: row.email,
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone,
            membershipTier: row.membershipTier
          }
        });

        if (error) throw error;

        if (data.updated) {
          updatedData[i] = { ...row, status: 'success', message: 'Updated existing' };
          updatedCount++;
        } else {
          updatedData[i] = { ...row, status: 'success', message: 'Created new' };
        }
        successCount++;
      } catch (err: any) {
        updatedData[i] = { ...row, status: 'error', message: err.message || 'Import failed' };
        errorCount++;
      }

      setImportProgress(((i + 1) / updatedData.length) * 100);
      setCsvData([...updatedData]);
    }

    setIsImporting(false);
    setImportComplete(true);
    toast.success(`Import complete: ${successCount} succeeded (${updatedCount} updated), ${errorCount} failed`);
  };

  const getStatusIcon = (status: ImportRow['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'skipped':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <div className="h-4 w-4 rounded-full bg-muted" />;
    }
  };

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      visitor: 'bg-gray-500',
      weekday: 'bg-teal-500',
      birdie: 'bg-blue-500',
      eagle: 'bg-purple-500'
    };
    return (
      <Badge className={`${colors[tier] || 'bg-gray-500'} text-white`}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </Badge>
    );
  };

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="text-center py-8">
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Import Customers</h1>
          <p className="text-muted-foreground">
            Upload a CSV file to import customers from GolfManager
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              CSV Upload
            </CardTitle>
            <CardDescription>
              CSV format: First Name, Last Name, Email, Contact No, Membership Tier
              <br />
              <span className="text-xs">Valid tiers: visitor, par, birdie, eagle, albatross (defaults to visitor if invalid)</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="max-w-xs"
              />
              {csvData.length > 0 && !isImporting && (
                <Button onClick={importCustomers} disabled={importComplete}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {csvData.length} Customers
                </Button>
              )}
            </div>

            {isImporting && (
              <div className="space-y-2">
                <Progress value={importProgress} />
                <p className="text-sm text-muted-foreground">
                  Importing... {Math.round(importProgress)}%
                </p>
              </div>
            )}

            {csvData.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Status</TableHead>
                      <TableHead>First Name</TableHead>
                      <TableHead>Last Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 100).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{getStatusIcon(row.status)}</TableCell>
                        <TableCell>{row.firstName}</TableCell>
                        <TableCell>{row.lastName}</TableCell>
                        <TableCell className="font-mono text-sm">{row.email}</TableCell>
                        <TableCell>{row.phone}</TableCell>
                        <TableCell>{getTierBadge(row.membershipTier)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {csvData.length > 100 && (
                  <div className="p-4 text-center text-sm text-muted-foreground border-t">
                    Showing first 100 of {csvData.length} rows
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Steps After Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Go to <strong>Marketing</strong> section</li>
              <li>Create the <strong>"Hub Launch"</strong> campaign</li>
              <li>Select <strong>All Customers</strong> as recipients</li>
              <li>Use the launch email template with:
                <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                  <li>Password reset link button</li>
                  <li>First week free promo code: <code className="bg-muted px-1 rounded">LAUNCH</code></li>
                  <li>Instructions to sign up for their membership tier</li>
                </ul>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
