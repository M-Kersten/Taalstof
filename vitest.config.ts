import { defineConfig } from 'vitest/config';

export default defineConfig({
  // De les neemt templates/lesson.css als tekst op; zonder deze regel geeft vitest een lege string.
  test: { include: ['test/**/*.test.ts'], css: { include: /templates\/lesson\.css/ } },
});
