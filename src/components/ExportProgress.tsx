import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ExportStatus } from '@/hooks/useRideData';
import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExportProgressProps {
    status: ExportStatus;
    progress: number;
    onDownload: () => void;
}

const ExportProgress: React.FC<ExportProgressProps> = ({ status, progress, onDownload }) => {
    if (status === 'idle') return null;

    const getStatusText = () => {
        switch (status) {
            case 'reading chunks': return 'Reading data from storage...';
            case 'assembling ndjson': return 'Assembling data points...';
            case 'zipping': return 'Compressing ride data (ZIP)...';
            case 'finalizing': return 'Finalizing export...';
            case 'ready': return 'Export ready for download';
            case 'error': return 'Export failed';
            default: return 'Processing...';
        }
    };

    const isComplete = status === 'ready';
    const isError = status === 'error';
    const isProcessing = !isComplete && !isError;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-6 p-4 glass-panel border border-primary/20 rounded-xl"
            >
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                        {isProcessing && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                        {isComplete && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {isError && <AlertCircle className="w-4 h-4 text-destructive" />}
                        <span className="text-sm font-medium">{getStatusText()}</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{progress}%</span>
                </div>

                <Progress value={progress} className="h-2 mb-4" />

                <div className="flex justify-end">
                    {isComplete ? (
                        <Button
                            onClick={onDownload}
                            className="w-full flex items-center justify-center space-x-2"
                            size="sm"
                        >
                            <Download className="w-4 h-4" />
                            <span>Download ZIP</span>
                        </Button>
                    ) : (
                        <Button disabled variant="outline" size="sm" className="w-full">
                            {isError ? 'An error occurred' : 'Wait for completion...'}
                        </Button>
                    )}
                </div>

                {isError && (
                    <p className="text-[10px] text-destructive mt-2 text-center">
                        Try refreshing or check if there is enough storage.
                    </p>
                )}
            </motion.div>
        </AnimatePresence>
    );
};

export default ExportProgress;
