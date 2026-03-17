# Contributing to Glab

## Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Follow the local development setup in [README.md](README.md)
4. Make your changes
5. Run tests and ensure the backend builds: `go build ./...`
6. Submit a pull request

## Development Guidelines

- Backend: follow standard Go conventions (`gofmt`, meaningful error messages)
- Frontend: TypeScript strict mode, no `any` unless unavoidable
- Database changes: always include both `.up.sql` and `.down.sql` migrations
- New sqlc queries: run `make sqlc` to regenerate Go code after editing `.sql` files

## Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Glab version or commit hash

## License

By contributing, you agree that your contributions will be licensed under the [GNU Affero General Public License v3.0](LICENSE).
