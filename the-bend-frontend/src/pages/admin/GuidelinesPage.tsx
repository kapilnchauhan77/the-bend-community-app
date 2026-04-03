import { useState, useEffect, useRef } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { adminApi } from '@/services/adminApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, Download, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface GuidelinesInfo {
  filename: string;
  uploaded_at: string;
  url: string;
  size_bytes?: number;
}

const PRIMARY = 'hsl(142, 76%, 36%)';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function GuidelinesPage() {
  const [current, setCurrent] = useState<GuidelinesInfo | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);

  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminApi
      .getCurrentGuidelines()
      .then((r) => setCurrent(r.data))
      .catch(() => setCurrent(null))
      .finally(() => setLoadingCurrent(false));
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) pickFile(file);
  };

  const pickFile = (file: File) => {
    setSelectedFile(file);
    setUploadSuccess(false);
    setUploadError('');
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess(false);
    try {
      const res = await adminApi.uploadGuidelines(selectedFile);
      setCurrent(res.data);
      setSelectedFile(null);
      setUploadSuccess(true);
    } catch {
      setUploadError('Upload failed. Please check the file and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Community Guidelines</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload and manage the community guidelines document
          </p>
        </div>

        {/* Current file */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Current Guidelines</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCurrent ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 size={16} className="animate-spin" />
                Loading...
              </div>
            ) : current ? (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'hsl(142, 76%, 93%)' }}
                  >
                    <FileText size={20} style={{ color: PRIMARY }} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{current.filename}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Uploaded {formatDate(current.uploaded_at)}
                      {current.size_bytes ? ` · ${formatBytes(current.size_bytes)}` : ''}
                    </p>
                  </div>
                </div>
                <a href={current.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download size={14} />
                    Download
                  </Button>
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No guidelines document uploaded yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Upload area */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Upload New Guidelines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {current && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>
                  Uploading a new file will replace the current guidelines document. All community
                  members will see the updated version immediately.
                </p>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-green-400 bg-green-50'
                  : selectedFile
                  ? 'border-green-300 bg-green-50/50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) pickFile(file);
                }}
              />
              {selectedFile ? (
                <div className="space-y-1">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto"
                    style={{ backgroundColor: 'hsl(142, 76%, 93%)' }}
                  >
                    <FileText size={22} style={{ color: PRIMARY }} />
                  </div>
                  <p className="font-medium text-sm mt-2">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Click to choose a different file</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload size={28} className="mx-auto text-muted-foreground opacity-50" />
                  <p className="text-sm font-medium text-gray-600">
                    Drag and drop your file here, or{' '}
                    <span style={{ color: PRIMARY }}>browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Supports PDF, DOC, DOCX</p>
                </div>
              )}
            </div>

            {/* Status messages */}
            {uploadSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                <CheckCircle size={16} />
                Guidelines uploaded successfully.
              </div>
            )}
            {uploadError && (
              <p className="text-sm text-red-500">{uploadError}</p>
            )}

            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="w-full text-white font-semibold"
              style={{ backgroundColor: selectedFile && !uploading ? PRIMARY : undefined }}
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Uploading...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload size={16} />
                  Upload Guidelines
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
