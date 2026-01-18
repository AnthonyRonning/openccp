{
  description = "OpenCCP - Twitter/X account graph analysis and sentiment tracking";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        
        commonInputs = with pkgs; [
          # Python
          python312
          uv
          
          # Database
          postgresql
          
          # Frontend
          bun
          nodejs_22
          
          # Utilities
          jq
          just
          
          # Deployment
          flyctl
          podman
        ];
        
        darwinOnlyInputs = with pkgs; [
          libiconv
        ];
        
        inputs = commonInputs
          ++ pkgs.lib.optionals pkgs.stdenv.isDarwin darwinOnlyInputs;

        setupPostgresScript = pkgs.writeShellScript "setup-postgres" ''
          export PGDATA="$PWD/.pgdata"
          export PGSOCKETS="$PWD/.pgsockets"
          
          # Only initialize if not already done
          if [ ! -d "$PGDATA" ]; then
            echo "Initializing PostgreSQL database..."
            mkdir -p "$PGDATA" "$PGSOCKETS"
            ${pkgs.postgresql}/bin/initdb -D "$PGDATA"
          fi
          
          # Check if PostgreSQL is already running
          if ! ${pkgs.postgresql}/bin/pg_isready -h localhost -p 5433 -q 2>/dev/null; then
            echo "Starting PostgreSQL..."
            ${pkgs.postgresql}/bin/pg_ctl start -D "$PGDATA" -o "-h localhost -p 5433 -k $PGSOCKETS" -l "$PGDATA/postgresql.log"
            
            # Wait for PostgreSQL to be ready
            until ${pkgs.postgresql}/bin/pg_isready -h localhost -p 5433 -q; do sleep 0.5; done
            
            # Create user and database if they don't exist
            ${pkgs.postgresql}/bin/psql -h localhost -p 5433 -tc "SELECT 1 FROM pg_roles WHERE rolname='openccp_user'" postgres | grep -q 1 || \
              ${pkgs.postgresql}/bin/psql -h localhost -p 5433 -c "CREATE USER openccp_user WITH PASSWORD 'openccp_pass';" postgres
            
            ${pkgs.postgresql}/bin/psql -h localhost -p 5433 -tc "SELECT 1 FROM pg_database WHERE datname='openccp'" postgres | grep -q 1 || \
              ${pkgs.postgresql}/bin/psql -h localhost -p 5433 -c "CREATE DATABASE openccp OWNER openccp_user;" postgres
            
            echo "PostgreSQL ready on port 5433"
          else
            echo "PostgreSQL already running on port 5433"
          fi
        '';

        setupEnvScript = pkgs.writeShellScript "setup-env" ''
          if [ ! -f .env ]; then
            cp .env.example .env
            echo "" >> .env
            echo "# Database (auto-configured by nix develop)" >> .env
            echo "DATABASE_URL=postgres://openccp_user:openccp_pass@localhost:5433/openccp" >> .env
            echo "Created .env from .env.example"
          fi
        '';
      in
      {
        devShells.default = pkgs.mkShell {
          packages = inputs;
          
          shellHook = ''
            echo ""
            echo "=========================================="
            echo "  OpenCCP Development Environment"
            echo "=========================================="
            echo ""
            
            ${setupEnvScript}
            ${setupPostgresScript}
            
            echo ""
            echo "Tools:"
            echo "  Python: $(python3 --version 2>&1 | cut -d' ' -f2)"
            echo "  uv:     $(uv --version 2>&1 | cut -d' ' -f2)"
            echo "  Bun:    $(bun --version)"
            echo "  Node:   $(node --version)"
            echo "  psql:   $(psql --version | cut -d' ' -f3)"
            echo ""
            echo "Database:"
            echo "  URL: postgres://openccp_user:openccp_pass@localhost:5433/openccp"
            echo ""
            echo "Commands:"
            echo "  psql -h localhost -p 5433 -U openccp_user openccp"
            echo ""
          '';
        };
      });
}
