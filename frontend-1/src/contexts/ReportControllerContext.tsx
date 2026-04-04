import React, { createContext, useContext, useState, ReactNode } from 'react';
import dayjs from 'dayjs';

interface ReportControllerContextType {
  dateRange: [dayjs.Dayjs, dayjs.Dayjs];
  setDateRange: (dateRange: [dayjs.Dayjs, dayjs.Dayjs]) => void;
  selectedOption: string;
  setSelectedOption: (option: string) => void;
  isCustomDate: boolean;
  setIsCustomDate: (isCustom: boolean) => void;
  tempStartYear: string;
  setTempStartYear: (year: string) => void;
  tempEndYear: string;
  setTempEndYear: (year: string) => void;
}

const ReportControllerContext = createContext<ReportControllerContextType | undefined>(undefined);

interface ReportControllerProviderProps {
  children: ReactNode;
}

export const ReportControllerProvider: React.FC<ReportControllerProviderProps> = ({ children }) => {
    // Initialize with current financial year
    const currentDate = new Date();
    const startOfFinancialYear = new Date(currentDate);
    if (startOfFinancialYear.getMonth() < 3) {
        startOfFinancialYear.setFullYear(startOfFinancialYear.getFullYear() - 1);
    }
    startOfFinancialYear.setMonth(3, 1);
    startOfFinancialYear.setHours(0, 0, 0, 0);

    const endOfFinancialYear = new Date(startOfFinancialYear);
    endOfFinancialYear.setFullYear(endOfFinancialYear.getFullYear() + 1);
    endOfFinancialYear.setDate(endOfFinancialYear.getDate() - 1);

    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs(startOfFinancialYear),
        dayjs(endOfFinancialYear)
    ]);

    const [selectedOption, setSelectedOption] = useState<string>("currentFinancialYear");
    const [isCustomDate, setIsCustomDate] = useState(false);
    const [tempStartYear, setTempStartYear] = useState<string>("");
    const [tempEndYear, setTempEndYear] = useState<string>("");

  const value: ReportControllerContextType = {
    dateRange,
    setDateRange,
    selectedOption,
    setSelectedOption,
    isCustomDate,
    setIsCustomDate,
    tempStartYear,
    setTempStartYear,
    tempEndYear,
    setTempEndYear,
  };

  return (
    <ReportControllerContext.Provider value={value}>
      {children}
    </ReportControllerContext.Provider>
  );
};

export const useReportController = (): ReportControllerContextType => {
  const context = useContext(ReportControllerContext);
  if (context === undefined) {
    throw new Error('useReportController must be used within a ReportControllerProvider');
  }
  return context;
};

export default ReportControllerContext;



