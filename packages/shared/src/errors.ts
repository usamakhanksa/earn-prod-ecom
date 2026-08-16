/**
 * RFC 9457 problem+json error shape (prompt.md API conventions).
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  /** Machine-readable error code, e.g. "POINTS_DAILY_CAP_REACHED". */
  code?: string;
  [key: string]: unknown;
}

export class ProblemDetailsError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.title);
    this.name = 'ProblemDetailsError';
    this.problem = problem;
  }
}

export function toProblemDetails(problem: ProblemDetails): ProblemDetails {
  return {
    type: problem.type,
    title: problem.title,
    status: problem.status,
    ...(problem.detail !== undefined ? { detail: problem.detail } : {}),
    ...(problem.instance !== undefined ? { instance: problem.instance } : {}),
    ...(problem.code !== undefined ? { code: problem.code } : {}),
  };
}