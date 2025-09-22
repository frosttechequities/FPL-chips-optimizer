
import json
import time
import uuid
from datetime import datetime
from pathlib import Path

import requests

BASE_URL = "http://localhost:5000/api/chat"
TEAM_ID = "7892155"
SLEEP_SECONDS = 0.8
OUTPUT_DIR = Path("logs/ai_copilot_tests")


def build_questions():
    questions = []

    analysis_focus = [
        "clean sheets",
        "captaincy choices",
        "bench depth",
        "rotation risks",
        "double gameweek preparation",
        "price rise potential",
        "premium balance",
        "midfield form",
        "defensive stability",
        "attacking upside",
        "fixture swings",
        "bench boost readiness",
    ]
    for idx, topic in enumerate(analysis_focus, start=1):
        gw = 7 + (idx % 6)
        prompt = f"Analyze my squad with emphasis on {topic} ahead of Gameweek {gw}."
        questions.append(("squad_analysis", prompt))

    transfer_scenarios = [
        ("sell Watkins", "buy Isak", "chasing Newcastle's fixtures"),
        ("move out Salah", "bring in Son", "budget reallocation"),
        ("downgrade a defender", "upgrade a forward", "improve goal threat"),
        ("replace injured striker", "sign a differential", "gain rank"),
        ("swap out budget midfielder", "bring in Palmer", "capitalise on form"),
        ("remove an underperforming premium", "add Saka", "stability"),
        ("ship a bench defender", "bring in Porro", "attacking returns"),
        ("free up cash", "buy Haaland", "captaincy security"),
        ("replace goalkeeper", "add Areola", "save funds"),
        ("trade Semenyo", "recruit Solanke", "fixture swing"),
        ("remove double up", "spread risk", "mini-league pressure"),
        ("sell suspended player", "bring in a starter", "avoid blanks"),
    ]
    for out_desc, in_desc, reason in transfer_scenarios:
        prompt = f"Help me {out_desc} and {in_desc} for {reason}."
        questions.append(("transfer_strategy", prompt))

    chip_scenarios = [
        "Is Gameweek 8 a good time for my wildcard?",
        "Should I hold triple captain for a confirmed double gameweek?",
        "Evaluate using bench boost right after wildcard.",
        "Compare free hit in a blank versus a double gameweek.",
        "When should I line up the second wildcard if I already used the first?",
        "Assess triple captain options for a premium forward in a single gameweek.",
        "Judge whether to free hit during heavy European rotation weeks.",
        "Outline a plan to pair wildcard and bench boost effectively.",
        "How soon should I schedule bench boost after building value?",
        "What chip strategy fits a team chasing top 50k from mid-table position?",
    ]
    for prompt in chip_scenarios:
        questions.append(("chip_strategy", prompt))

    fixture_scenarios = [
        "Rate Aston Villa's next five fixtures for attack and defence.",
        "How tough is Brentford's run from Gameweek 7 to 11?",
        "Spot fixture swings that benefit budget defenders soon.",
        "Which teams have back-to-back away matches with low FDR?",
        "Highlight any double gameweeks expected around Gameweek 12.",
        "Identify clubs facing strong opposition three weeks in a row.",
        "Compare fixture difficulty for Spurs and Chelsea over the next month.",
        "Which promoted team has the softest autumn schedule?",
        "Flag a window to target Liverpool assets based on fixtures.",
        "When do Manchester United fixtures turn positive again?",
    ]
    for prompt in fixture_scenarios:
        questions.append(("fixture_analysis", prompt))

    comparison_pairs = [
        ("Saka", "Foden", "midfield pick"),
        ("Watkins", "Isak", "forward slot"),
        ("Palmer", "Gordon", "mid-price midfielder"),
        ("Gabriel", "Botman", "defender value"),
        ("Areola", "Flekken", "budget keeper"),
        ("Toney", "Solanke", "striker differential"),
        ("Diaz", "Kulusevski", "midfield punt"),
        ("Mitoma", "Bailey", "fixture run"),
        ("Trippier", "Pedro Porro", "premium defender"),
        ("Gross", "Eze", "set-piece reliability"),
    ]
    for left, right, context in comparison_pairs:
        prompt = f"Compare {left} versus {right} as my {context}."
        questions.append(("player_comparison", prompt))

    injury_checks = [
        "Is Darwin Nunez likely to start this week after recent knocks?",
        "Update me on Wilson's hamstring status before the weekend.",
        "Is Martinelli expected back in training for the next fixture?",
        "What is the outlook on Reece James minutes after his return?",
        "Should I worry about Saka's minor knock from last match?",
        "Is Luke Shaw close to full fitness for Manchester United?",
        "Provide the latest on Evan Ferguson's availability.",
        "Any setback for Matty Cash after his midweek appearance?",
    ]
    for prompt in injury_checks:
        questions.append(("injury_news", prompt))

    differential_hunts = [
        "Suggest under 10 percent owned midfielders with upside.",
        "Name a differential forward with good xG in the next month.",
        "List defensive punts who cover clean sheets and attacking threat.",
        "Identify low-owned captain punts for a high-risk week.",
        "Spot hidden gems from promoted teams worth short term investment.",
        "Which bench enablers could explode during festive congestion?",
        "Find differentials for managers chasing in mini-leagues.",
        "Target sub 5 percent owned assets that align with fixture swings.",
    ]
    for prompt in differential_hunts:
        questions.append(("differentials", prompt))

    budget_management = [
        "Help me stretch a 100.5 million budget without sacrificing premiums.",
        "How can I rebalance funds from defence to attack efficiently?",
        "Is it viable to go without Haaland and spread cash elsewhere?",
        "Advise on downgrading goalkeeper to free funds for midfield upgrade.",
        "Plan a two transfer sequence to fund a premium defender move.",
        "Suggest budget-friendly midfield rotations for autumn.",
        "Manage price drops after an early wildcard without losing value.",
        "What is the best way to bank cash for a future double gameweek?",
        "Should I chase team value rises aggressively right now?",
        "How much money should remain in the bank for flexibility?",
    ]
    for prompt in budget_management:
        questions.append(("budgeting", prompt))

    risk_profiles = [
        "Outline a conservative strategy to protect a narrow mini-league lead.",
        "Design an aggressive plan to climb 500k ranks quickly.",
        "How risky is it to triple up on one club's attack right now?",
        "When is it smart to take a four point hit in the next month?",
        "Balance short term punts with long term structure for my squad.",
        "Should I mirror template teams or back contrarian picks?",
        "Quantify the risk of rolling transfers versus taking hits.",
        "Is it viable to captain a defender when chasing?",
        "How can I manage volatility during December fixture congestion?",
        "What risk profile suits an FPL manager targeting top 10k?",
    ]
    for prompt in risk_profiles:
        questions.append(("risk_management", prompt))

    general_queries = [
        "Summarise key talking points from the latest press conferences.",
        "Which stats should I monitor weekly to stay ahead?",
        "Give me a checklist for finalising my squad on deadline day.",
        "How should I plan around international breaks to avoid injuries?",
        "Share best practices for monitoring price changes daily.",
        "What are the biggest mistakes to avoid in the next five gameweeks?",
        "Explain how to integrate expected goals into my decisions.",
        "Provide advice for managing both FPL and Champions League fantasy.",
        "What late season tactics help secure mini-league wins?",
        "Offer tips for evaluating eye test versus data driven calls.",
    ]
    for prompt in general_queries:
        questions.append(("general_strategy", prompt))

    if len(questions) != 100:
        raise ValueError(f"Expected 100 questions, got {len(questions)}")

    return questions


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    out_path = OUTPUT_DIR / f"run_{timestamp}.json"
    questions = build_questions()

    results = []
    summary = {"total": len(questions), "success": 0, "fail": 0}

    for idx, (category, prompt) in enumerate(questions, start=1):
        payload = {
            "message": prompt,
            "teamId": TEAM_ID,
            "sessionId": f"autotest_{uuid.uuid4().hex}",
        }
        started = time.time()
        record = {
            "index": idx,
            "category": category,
            "prompt": prompt,
            "payload": payload,
        }
        try:
            response = requests.post(BASE_URL, json=payload, timeout=30)
            latency_ms = round((time.time() - started) * 1000, 1)
            record["status_code"] = response.status_code
            record["latency_ms"] = latency_ms
            try:
                data = response.json()
            except json.JSONDecodeError:
                data = None
            record["response_json"] = data
            if response.ok and isinstance(data, dict) and data.get("success"):
                summary["success"] += 1
            else:
                summary["fail"] += 1
                record["error"] = "Non-success response"
        except Exception as exc:  # pylint: disable=broad-except
            summary["fail"] += 1
            record["error"] = str(exc)
        results.append(record)
        time.sleep(SLEEP_SECONDS)

    output_payload = {
        "generated_at": timestamp,
        "base_url": BASE_URL,
        "team_id": TEAM_ID,
        "summary": summary,
        "results": results,
    }
    out_path.write_text(json.dumps(output_payload, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} with summary: {summary}")


if __name__ == "__main__":
    main()
