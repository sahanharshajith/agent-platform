# SNS topic for human-in-the-loop approval notifications
resource "aws_sns_topic" "approvals" {
  name = "agent_approvals"

  tags = {
    Name = "agent_approvals"
  }
}

# Email subscription for approver notifications
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.approvals.arn
  protocol  = "email"
  endpoint  = var.approval_email
}