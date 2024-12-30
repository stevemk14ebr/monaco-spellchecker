import { defineConfig } from 'vite';

export default defineConfig({
    base: '/',
    server: {
        port: 3000,
        open: true,
    },
    build: {
        outDir: 'lib',
        minify: true,
        lib: {
            entry: 'src/spellchecker.ts',
            formats: ['es', 'cjs'],
            name: 'MonacoSpellchecker',
            fileName (format) {
                return `spellchecker.${format}.js`
            }
        }
    },
});
