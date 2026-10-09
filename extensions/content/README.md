# Content extensions

The catalog contains seven content packages. Each package includes a manifest, implementation, icon, license, source provenance where applicable, and contract and behavior tests.

Create a new scaffold from the repository root with:

```sh
node packages/cli/bin/manko-ext.mjs new --id ExampleSource --name "Example Source"
```

Tracker packages live under `extensions/tracker`. Theme extension packages are unsupported.
