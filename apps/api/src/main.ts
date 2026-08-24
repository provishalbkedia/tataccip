// Must run before any other import: several modules (e.g. auth.module.ts)
// read process.env.* at module-evaluation time via decorator arguments, which
// happens before ConfigModule.forRoot() would otherwise get a chance to run.
import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Both Render and Cloud Run terminate TLS at a proxy in front of the app,
  // so without this every request's socket IP is the proxy's internal
  // address, not the real client — @Ip() (used for login-history logging)
  // needs this to read the real IP from X-Forwarded-For instead.
  app.getHttpAdapter().getInstance().set("trust proxy", true);

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  // WEB_ORIGIN unset means "reflect the request origin" — needed because cloud
  // dev environments (e.g. GitHub Codespaces) serve the web app from a
  // per-session forwarded URL that isn't known at config time.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(",") : true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("CCIP API")
    .setDescription("Connectivity Coverage Intelligence Platform API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  // PORT is the convention most Node hosts (Render, Railway, Heroku) inject;
  // API_PORT is our own local-dev override. Bind to 0.0.0.0 so the process is
  // reachable from outside its container, not just localhost.
  const port = process.env.PORT ?? process.env.API_PORT ?? 4000;
  await app.listen(port, "0.0.0.0");
  console.log(`CCIP API listening on port ${port}`);
  console.log(`Swagger docs at /api/docs`);
}

bootstrap();
