// 고정 어휘의 한글 표시명. 서버는 라벨이 필요 없으므로 프런트에만 둔다.
export const TOPIC_LABELS: Record<string, string> = {
  economy: '경제', finance: '재테크·투자', realestate: '부동산', policy: '정책·제도',
  tech: '기술', ai: 'AI', career: '커리어·일', health: '건강',
  parenting: '육아·교육', living: '생활·소비', culture: '문화·여가',
  world: '국제', sports: '스포츠',
};

export const JOB_FIELD_LABELS: Record<string, string> = {
  it: 'IT·개발', finance: '금융', medical: '의료', edu: '교육',
  public: '공공', manufacturing: '제조', service: '서비스', etc: '기타',
};

export const HOUSEHOLD_LABELS: Record<string, string> = {
  single: '미혼', married: '기혼', with_kids: '자녀 있음',
};
