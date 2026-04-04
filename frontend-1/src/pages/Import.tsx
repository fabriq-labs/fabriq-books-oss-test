import { ImportPannel } from '@/components/import/ImportPannel';
import TransactionImport from '@/components/import/TransactionImport';
import React from 'react';

interface ImportPageProps {
    type: string;
    view: string;
    metaData: any;
    clearImport: () => void;
    relation?: any;
    relationView?: string;
    relationField?: string;
    handleDiscard?: () => void;
    handleUploadComplete?: (data: any) => void;
    updateCSVData?: (formattedData: any, relationId: any) => any;
    relationFieldId?: string;
    additionalFileds?: any[];
    fetchList?: () => void;
}

const ImportPage: React.FC<ImportPageProps> = ({
    type,
    view,
    clearImport,
    metaData,
    relation,
    relationView,
    relationField,
    handleDiscard,
    handleUploadComplete,
    updateCSVData,
    relationFieldId,
    additionalFileds = [],
    fetchList
}) => {

    return (
        <>
            {/* {metaData && <TransactionImport
                clearImport={clearImport}
                type={type || ''}
                view={view || ''}
                metaData={metaData || {}}
            />
            } */}
            {metaData && <ImportPannel
                modelType={type}
                modelView={view}
                relation={relation}
                relationView={relationView}
                relationField={relationField}
                onDiscard={handleDiscard}
                onUploadComplete={handleUploadComplete}
                updateCSVData={updateCSVData}
                relationFieldId={relationFieldId}
                metaData={metaData}
                additionalFileds={additionalFileds}
                onList={fetchList}
                clearImport={clearImport}
            />
            }
        </>
    );
};
export default ImportPage;