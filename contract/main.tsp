import "@typespec/http";
import "@typespec/openapi3";

using TypeSpec.Http;

@service(#{ title: "Call Calendar API" })
namespace Calendar;

@route("/api/health")
@get
op health(): { status: "ok" };

model MeetingTypeInput {
  @minLength(1) @maxLength(100) name: string;
  @minLength(1) @maxLength(1000) description: string;
  @minValue(1) @maxValue(2147483647) durationMinutes: int32;
}
model MeetingType extends MeetingTypeInput {
  id: string;
  version: int32;
}
model ApiError {
  code: string;
  message: string;
  fields?: Record<string>;
}
@route("/api/meeting-types")
interface MeetingTypes {
  @get list(): MeetingType[] | { @statusCode statusCode: 500; @body body: ApiError } | { @statusCode statusCode: 503; @body body: ApiError };
  @post create(@body input: MeetingTypeInput): { @statusCode statusCode: 201; @header etag: string; @body body: MeetingType } | { @statusCode statusCode: 400; @body body: ApiError } | { @statusCode statusCode: 500; @body body: ApiError } | { @statusCode statusCode: 503; @body body: ApiError };
}
