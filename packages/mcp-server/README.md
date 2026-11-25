# @lineedge/lemail-mcp-server

LEMail(메일·주소록·캘린더)을 Claude Desktop, Cursor 등 로컬 AI 클라이언트와 연동하기 위한 Model Context Protocol (MCP) Stdio 서버입니다.

## 환경 변수
- `LEMAIL_API_URL`: LEMail API 주소 (기본값: `http://localhost:9200/api`)
- `LEMAIL_API_KEY`: 웹메일 **환경설정 > MCP 연동**에서 발급받은 개인 API Key (`lem_...`)

## Claude Desktop 설정 예시 (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "lemail": {
      "command": "npx",
      "args": [
        "-y",
        "@lineedge/lemail-mcp-server"
      ],
      "env": {
        "LEMAIL_API_URL": "http://localhost:9200/api",
        "LEMAIL_API_KEY": "lem_발급받은_API_KEY"
      }
    }
  }
}
```
