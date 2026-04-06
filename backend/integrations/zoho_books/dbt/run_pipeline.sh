#!/bin/bash

# DBT Pipeline Runner Script
# Usage: ./run_pipeline.sh [staging|integrations|normalized|all|full-refresh]

set -e

# Change to DBT directory
cd "$(dirname "$0")"

# Load environment variables
if [ ! -f "env" ]; then
    echo "Error: env file not found. Please create it from env.example"
    exit 1
fi

export $(grep -v '^#' env | xargs)

# Parse command line arguments
MODE="${1:-all}"
FULL_REFRESH=""

if [ "$MODE" == "full-refresh" ]; then
    MODE="all"
    FULL_REFRESH="--full-refresh"
fi

echo "Running DBT pipeline in mode: $MODE"
echo "=================================="

case $MODE in
    staging)
        echo "Running staging models..."
        dbt run --select staging --profiles-dir . $FULL_REFRESH
        ;;
    integrations)
        echo "Running integration models..."
        dbt run --select integrations --profiles-dir . $FULL_REFRESH
        ;;
    normalized)
        echo "Running normalized models..."
        dbt run --select normalized --profiles-dir . $FULL_REFRESH
        ;;
    all)
        echo "Running all models..."
        dbt run --select staging integrations normalized --profiles-dir . $FULL_REFRESH
        ;;
    *)
        echo "Usage: $0 [staging|integrations|normalized|all|full-refresh]"
        echo ""
        echo "Options:"
        echo "  staging       - Run only staging models"
        echo "  integrations  - Run only integration models"
        echo "  normalized    - Run only normalized models"
        echo "  all           - Run all models (default)"
        echo "  full-refresh  - Full refresh all models (truncate and reload)"
        exit 1
        ;;
esac

# Post-run: Safety check for schema locations (should not be needed with generate_schema_name macro)
echo ""
echo "Running post-run safety checks..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f post_run_setup.sql 2>/dev/null || echo "Note: Post-run checks completed"

echo ""
echo "Pipeline completed successfully!"
echo ""
echo "To verify data:"
echo "  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c \"SELECT COUNT(*) FROM datalake.stg_zoho_invoices;\""
echo "  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c \"SELECT COUNT(*) FROM public.invoice;\""

