#!/bin/bash

# Master Automation Runner
# Executes all automation workflows

echo "🚀 Starting Master Automation Runner..."
echo "========================================"

# Set base directory
BASE_DIR="/home/meep"
CONFIG_DIR="$BASE_DIR/.config/opencode"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if project exists
check_project() {
    if [ ! -d "$BASE_DIR/$1" ]; then
        print_error "Project $1 not found at $BASE_DIR/$1"
        return 1
    fi
    return 0
}

# Function to run project tests
test_project() {
    local project=$1
    print_status "Testing $project..."
    
    cd "$BASE_DIR/$project"
    
    if npm run check > /dev/null 2>&1 && npm run build > /dev/null 2>&1 && npm run test > /dev/null 2>&1; then
        print_success "$project tests passed"
        return 0
    else
        print_error "$project tests failed"
        return 1
    fi
}

# Function to check deployment status
check_deployment() {
    local project=$1
    print_status "Checking deployment status for $project..."
    
    cd "$CONFIG_DIR"
    if node deployment-manager.js check "$project" > /dev/null 2>&1; then
        print_success "$project deployment check completed"
    else
        print_warning "$project deployment check failed (may need credentials setup)"
    fi
}

# Function to check for security issues
check_security() {
    local project=$1
    print_status "Running security check for $project..."
    
    cd "$BASE_DIR/$project"
    
    if npm audit --audit-level=moderate > /dev/null 2>&1; then
        print_success "$project security check passed"
    else
        print_warning "$project has security vulnerabilities"
    fi
}

# Function to check for outdated dependencies
check_dependencies() {
    local project=$1
    print_status "Checking dependencies for $project..."
    
    cd "$BASE_DIR/$project"
    
    # Detect runtime and use appropriate package manager
    if [ -f "bun.lockb" ]; then
        pkg_manager="bun"
    elif [ -f "pnpm-lock.yaml" ]; then
        pkg_manager="pnpm"
    elif [ -f "yarn.lock" ]; then
        pkg_manager="yarn"
    else
        pkg_manager="npm"
    fi
    
    if $pkg_manager outdated > /dev/null 2>&1; then
        print_warning "$project has outdated dependencies"
    else
        print_success "$project dependencies are up to date"
    fi
}

check_tanstack_optimization() {
    local project=$1
    print_status "Checking TanStack optimization for $project..."
    
    cd "$BASE_DIR/$project"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        return
    fi
    
    # Read dependencies
    has_router=$(grep -q "@tanstack/react-router" package.json && echo "true" || echo "false")
    has_query=$(grep -q "@tanstack/react-query" package.json && echo "true" || echo "false")
    has_server=$(grep -q "@tanstack/start" package.json && echo "true" || echo "false")
    has_supabase=$(grep -q "@supabase/supabase-js" package.json && echo "true" || echo "false")
    has_convex=$(grep -q "convex" package.json && echo "true" || echo "false")
    
    # Suggest TanStack Query if missing
    if [ "$has_router" = "true" ] && [ "$has_query" = "false" ]; then
        if [ "$has_supabase" = "true" ]; then
            print_warning "Consider adding TanStack Query for Supabase caching"
        elif [ "$has_convex" = "true" ]; then
            print_warning "Consider adding TanStack Query for Convex optimistic updates"
        fi
    fi
    
    # Suggest TanStack Server
    if [ "$has_router" = "true" ] && [ "$has_server" = "false" ]; then
        print_warning "Consider TanStack Start for full-stack development"
    fi
    
    # Check for optimization opportunities
    if [ "$has_router" = "true" ] && [ "$has_query" = "true" ]; then
        print_success "TanStack Router + Query optimally configured"
    fi
}

# Main execution
main() {
    local project_count=0
    local success_count=0
    
    # Discover projects dynamically
    echo "🔍 Discovering projects..."
    projects=($(find "$BASE_DIR" -maxdepth 2 -name "package.json" -exec dirname {} \; | xargs -I {} basename {} | grep -v node_modules | sort))
    
    print_status "Starting comprehensive automation check..."
    
    for project in "${projects[@]}"; do
        if check_project "$project"; then
            ((project_count++))
            
            echo ""
            print_status "=== $project ==="
            
        # Run all checks with TanStack optimization
        test_project "$project" && ((success_count++))
        check_deployment "$project"
        check_security "$project"
        check_dependencies "$project"
        check_tanstack_optimization "$project"
        fi
    done
    
    echo ""
    print_status "=== SUMMARY ==="
    echo "Projects checked: $project_count"
    echo "Successful tests: $success_count"
    
    if [ $success_count -eq $project_count ]; then
        print_success "All projects passed their tests!"
        print_status "Ready for deployment operations."
    else
        print_warning "Some projects failed. Review issues before deployment."
    fi
    
    echo ""
    print_status "Automation complete! 🎉"
}

# Run main function
main "$@"