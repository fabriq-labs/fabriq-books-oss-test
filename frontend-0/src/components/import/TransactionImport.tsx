
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, FileText, Upload } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TransactionDataTable from "./TransactionDataTable";
import { useNavigate } from "react-router-dom";
import Papa from 'papaparse';

interface TransactionImportProps {
    clearImport: () => void;
    type: string;
    view: string;
    metaData: any;
}

interface CSVData {
    headers: string[];
    rows: Record<string, string>[];
}

const TransactionImport = ({ clearImport, type, view, metaData }: TransactionImportProps) => {
    const { toast } = useToast();
    const [showDataTable, setShowDataTable] = useState(false);
    const navigate = useNavigate();
    const [csvData, setCsvData] = useState<CSVData | null>(null);

    const handleUpload = (type: 'csv' | 'pdf') => {
        if (type === 'csv') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv';

            input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        complete: (results) => {
                            const headers = results.meta.fields || [];
                            const rows = results.data as Record<string, string>[];

                            setCsvData({ headers, rows });

                            toast({
                                title: `File processed: ${file.name}`,
                                description: `Found ${headers.length} columns and ${rows.length} rows.`
                            });

                            setShowDataTable(true);
                        },
                        error: (error) => {
                            toast({
                                title: "Error processing CSV",
                                description: error.message,
                                variant: "destructive"
                            });
                        }
                    });
                }
            };

            input.click();
        } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf';

            input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                    toast({
                        title: `File selected: ${file.name}`,
                        description: "Your file has been selected for upload."
                    });
                    console.log(`Selected ${type.toUpperCase()} file:`, file);
                }
            };

            input.click();
        }
    };

    const handleBack = () => {
        setShowDataTable(false);
        if (clearImport) clearImport();
    };

    const handleFinalUpload = () => {
        toast({
            title: "CSV Data Uploaded",
            description: "Your data has been successfully processed."
        });
        setShowDataTable(false);
    };

    if (showDataTable) {
        return (
            <div className="w-full max-w-6xl p-6">
                <TransactionDataTable
                    csvHeaders={csvData.headers}
                    csvData={csvData.rows}
                    metaData={metaData}
                    onBack={handleBack}
                    onUpload={handleFinalUpload}
                    clearImport={clearImport} />
            </div>
        );
    }

    return (
        <div className="w-full max-w-3xl p-6">
            <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-gray-900">Import Transactions via CSV</h1>
                <p className="mt-3 text-gray-600">What would you like to do?</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6 hover:shadow-md transition-shadow border-2 border-gray-100 cursor-pointer" onClick={() => handleUpload('csv')}>
                    <div className="flex flex-col items-center justify-center h-32">
                        <Upload className="h-10 w-10 text-gray-700 mb-4" />
                        <span className="font-medium text-gray-800">UPLOAD A NEW CSV</span>
                    </div>
                </Card>

                <Card className="p-6 hover:shadow-md transition-shadow border-2 border-gray-100 cursor-pointer" onClick={() => handleUpload('pdf')}>
                    <div className="flex flex-col items-center justify-center h-32">
                        <FileText className="h-10 w-10 text-gray-700 mb-4" />
                        <span className="font-medium text-gray-800">UPLOAD PDF</span>
                    </div>
                </Card>
            </div>

            <div className="flex justify-start mt-6">
                <Button
                    variant="outline"
                    onClick={clearImport}
                    className="group flex items-center gap-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                    <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                    <span>Back to Dashboard</span>
                </Button>
            </div>
        </div>
    );
};

export default TransactionImport;