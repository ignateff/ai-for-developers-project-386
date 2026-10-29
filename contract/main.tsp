import "@typespec/http";
import "@typespec/openapi3";

using TypeSpec.Http;

@service(#{ title: "Call Calendar API" })
namespace Calendar;

@route("/api/health")
@get
op health(): { status: "ok" };
