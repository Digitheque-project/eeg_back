import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status: number = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const isMessageBody = (value: unknown): value is { message: string } =>
      typeof value === 'object' && value !== null && 'message' in value;
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : isMessageBody(exceptionResponse)
          ? exceptionResponse.message
          : ((exception as Error)?.message ?? 'Internal server error');

    const internalServerErrorCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= internalServerErrorCode) {
      this.logger.error(
        `${request.method} ${request.url} - ${message}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: isHttpException ? exception.name : 'InternalServerError',
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
