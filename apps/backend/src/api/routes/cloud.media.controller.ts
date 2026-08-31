import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { getR2Object } from '@gitroom/nestjs-libraries/upload/r2.uploader';

const SAFE_OBJECT_KEY = /^[a-zA-Z0-9._-]+$/;

@ApiTags('Public media')
@Controller('/media-cloud')
export class CloudMediaController {
  @Get('/:key')
  async getMedia(
    @Param('key') key: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    if (
      process.env.STORAGE_PROVIDER !== 'cloudflare' ||
      !SAFE_OBJECT_KEY.test(key)
    ) {
      return response.status(404).end();
    }

    try {
      const object = await getR2Object(key, request.headers.range);
      if (!object.Body) {
        return response.status(404).end();
      }

      response.status(request.headers.range ? 206 : 200);
      response.setHeader(
        'Content-Type',
        object.ContentType || 'application/octet-stream'
      );
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader(
        'Cache-Control',
        'public, max-age=300, must-revalidate'
      );
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'none'; script-src 'none'; frame-ancestors 'none'; sandbox"
      );
      if (object.ContentLength !== undefined) {
        response.setHeader('Content-Length', object.ContentLength.toString());
      }
      if (object.ContentRange) {
        response.setHeader('Content-Range', object.ContentRange);
      }
      if (object.ETag) {
        response.setHeader('ETag', object.ETag);
      }
      if (object.LastModified) {
        response.setHeader('Last-Modified', object.LastModified.toUTCString());
      }

      // The Node.js AWS SDK returns a readable stream here.
      return (object.Body as NodeJS.ReadableStream).pipe(response);
    } catch (error: any) {
      if (
        error?.name === 'NoSuchKey' ||
        error?.name === 'NotFound' ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        return response.status(404).end();
      }
      return response.status(502).end();
    }
  }
}
