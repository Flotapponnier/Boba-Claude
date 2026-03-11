#!/bin/bash

echo "📋 Dernières sessions Claude:"
echo ""

cd ~/.claude/sessions 2>/dev/null || { echo "❌ Aucune session trouvée"; exit 1; }

ls -lt *.jsonl 2>/dev/null | head -5 | while read -r line; do
  filename=$(echo "$line" | awk '{print $NF}')
  session_id="${filename%.jsonl}"
  date=$(echo "$line" | awk '{print $6, $7, $8}')
  size=$(echo "$line" | awk '{print $5}')

  # Premier et dernier message
  first_msg=$(head -1 "$filename" 2>/dev/null | jq -r '.content // .message.content // empty' 2>/dev/null | head -c 50)

  echo "🔹 Session: $session_id"
  echo "   Date: $date | Taille: $size bytes"
  [ -n "$first_msg" ] && echo "   Preview: $first_msg..."
  echo ""
done
