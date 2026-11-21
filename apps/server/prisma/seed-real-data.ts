import dotenv from "dotenv";
dotenv.config({ path: "apps/server/.env" });
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const COLLEGES_DATA = [
  {
    name: "كلية علوم الحاسب والمعلومات",
    majors: [
      "علوم الحاسب",
      "نظم المعلومات",
      "هندسة البرمجيات",
      "الأمن السيبراني",
      "الذكاء الاصطناعي",
      "علم البيانات",
      "تقنية المعلومات",
    ],
    courses: [
      { title: "مبادئ البرمجة", level: "المستوى الأول" },
      { title: "البرمجة كائنية التوجه", level: "المستوى الثاني" },
      { title: "هياكل البيانات والخوارزميات", level: "المستوى الثالث" },
      { title: "قواعد البيانات وتصميمها", level: "المستوى الرابع" },
      { title: "نظم التشغيل", level: "المستوى الخامس" },
      { title: "شبكات الحاسب وبروتوكولاتها", level: "المستوى الخامس" },
      { title: "هندسة البرمجيات المتقدمة", level: "المستوى السادس" },
      { title: "مبادئ الذكاء الاصطناعي", level: "المستوى السادس" },
      { title: "أساسيات الأمن السيبراني", level: "المستوى السابع" },
      { title: "تطوير تطبيقات الويب الحديثة", level: "المستوى السابع" },
      { title: "تطوير تطبيقات الهواتف الذكية", level: "المستوى الثامن" },
      { title: "الحوسبة السحابية والنظم الموزعة", level: "المستوى الثامن" },
    ],
  },
  {
    name: "كلية الهندسة",
    majors: [
      "الهندسة الكهربائية",
      "الهندسة الميكانيكية",
      "الهندسة المدنية",
      "الهندسة الصناعية",
      "الهندسة الكيميائية",
      "الهندسة المعمارية",
    ],
    courses: [
      { title: "الرسم الهندسي والتصميم بمساعدة الحاسب", level: "المستوى الأول" },
      { title: "ميكانيكا المواد ومقاومتها", level: "المستوى الثاني" },
      { title: "الاستاتيكا والديناميكا الهندسية", level: "المستوى الثالث" },
      { title: "الدوائر الكهربائية وتحليلها", level: "المستوى الرابع" },
      { title: "الديناميكا الحرارية وتطبيقاتها", level: "المستوى الخامس" },
      { title: "ميكانيكا الموائع", level: "المستوى السادس" },
      { title: "أنظمة التحكم الآلي", level: "المستوى السابع" },
      { title: "هندسة المواد وتصنيعها", level: "المستوى الثامن" },
    ],
  },
  {
    name: "كلية إدارة الأعمال",
    majors: [
      "إدارة الأعمال",
      "المحاسبة",
      "المالية والاستثمار",
      "التسويق",
      "نظم المعلومات الإدارية",
      "إدارة الموارد البشرية",
      "إدارة العمليات وسلاسل الإمداد",
    ],
    courses: [
      { title: "مبادئ إدارة الأعمال", level: "المستوى الأول" },
      { title: "مبادئ المحاسبة المالية", level: "المستوى الثاني" },
      { title: "مبادئ الاقتصاد الجزئي", level: "المستوى الثاني" },
      { title: "مبادئ الاقتصاد الكلي", level: "المستوى الثالث" },
      { title: "مبادئ التسويق وسلوك المستهلك", level: "المستوى الثالث" },
      { title: "الإدارة المالية والتحليل المالي", level: "المستوى الرابع" },
      { title: "محاسبة التكاليف والمحاسبة الإدارية", level: "المستوى الخامس" },
      { title: "إدارة الموارد البشرية", level: "المستوى السادس" },
      { title: "إدارة العمليات وسلاسل الإمداد", level: "المستوى السابع" },
      { title: "ريادة الأعمال وإدارة المشاريع الصغيرة", level: "المستوى الثامن" },
    ],
  },
  {
    name: "كلية العلوم",
    majors: [
      "الرياضيات",
      "الفيزياء",
      "الكيمياء",
      "الأحياء العامة",
      "الإحصاء وبحوث العمليات",
      "الكيمياء الحيوية",
    ],
    courses: [
      { title: "حساب التفاضل والتكامل", level: "المستوى الأول" },
      { title: "حساب التفاضل والتكامل المتقدم", level: "المستوى الثاني" },
      { title: "الجبر الخطي والمصفوفات", level: "المستوى الثاني" },
      { title: "الفيزياء العامة للمسار العلمي", level: "المستوى الأول" },
      { title: "الفيزياء الحديثة والكهرومغناطيسية", level: "المستوى الثالث" },
      { title: "الكيمياء العامة وتطبيقاتها", level: "المستوى الأول" },
      { title: "الكيمياء العضوية", level: "المستوى الثالث" },
      { title: "الكيمياء الحيوية العامة", level: "المستوى الرابع" },
      { title: "علم الأحياء الخلوية والوراثة", level: "المستوى الثاني" },
      { title: "الإحصاء والاحتمالات التطبيقية", level: "المستوى الثالث" },
      { title: "المعادلات التفاضلية وتطبيقاتها", level: "المستوى الرابع" },
      { title: "الرياضيات المتقطعة لعلوم الحاسب", level: "المستوى الثالث" },
    ],
  },
  {
    name: "كلية الطب والعلوم الصحية",
    majors: [
      "الطب البشري والجراحة",
      "طب وجراحة الأسنان",
      "الصيدلة الإكلينيكية",
      "التمريض",
      "علوم المختبرات الإكلينيكية",
      "العلاج الطبيعي والتأهيل الصحي",
    ],
    courses: [
      { title: "علم التشريح العام والسطحي", level: "المستوى الأول" },
      { title: "علم وظائف الأعضاء والأجهزة الحيوية", level: "المستوى الثاني" },
      { title: "علم الأنسجة والأجنة", level: "المستوى الثاني" },
      { title: "علم الأمراض العام", level: "المستوى الثالث" },
      { title: "علم الأدوية والسموم والجرعات العلاجية", level: "المستوى الرابع" },
      { title: "علم الأحياء الدقيقة والمناعة الطبية", level: "المستوى الثالث" },
      { title: "الكيمياء الحيوية السريرية", level: "المستوى الرابع" },
      { title: "الصحة العامة وعلم الوبائيات", level: "المستوى الخامس" },
    ],
  },
  {
    name: "كلية الحقوق والأنظمة",
    majors: [
      "القانون العام",
      "القانون الخاص",
      "الأنظمة واللوائح",
      "الشريعة والدراسات الإسلامية",
    ],
    courses: [
      { title: "المدخل إلى دراسة علم القانون", level: "المستوى الأول" },
      { title: "القانون التجاري والشركات", level: "المستوى الثاني" },
      { title: "القانون الإداري والقرارات الإدارية", level: "المستوى الثالث" },
      { title: "القانون المدني ومصادر الالتزام", level: "المستوى الرابع" },
      { title: "القانون الجنائي العام والخاص", level: "المستوى الخامس" },
      { title: "نظام العمل والتأمينات الاجتماعية السعودي", level: "المستوى السادس" },
      { title: "الملكية الفكرية وحماية الابتكار", level: "المستوى السابع" },
      { title: "القانون الدولي العام والمنظمات الدولية", level: "المستوى الثامن" },
    ],
  },
  {
    name: "كلية الآداب واللغات والإنسانيات",
    majors: [
      "اللغة الإنجليزية والترجمة",
      "اللغة العربية وآدابها",
      "الإعلام والاتصال الرقمي",
      "علم النفس الاجتماعي",
    ],
    courses: [
      { title: "مهارات اللغة الإنجليزية الأكاديمية", level: "المستوى الأول" },
      { title: "مبادئ الترجمة التحريرية والفورية", level: "المستوى الثاني" },
      { title: "مهارات الكتابة والتحرير الأكاديمي", level: "المستوى الأول" },
      { title: "مهارات التواصل الجامعي والعرض الإلقائي", level: "المستوى الأول" },
      { title: "المدخل إلى وسائل الإعلام الحديثة", level: "المستوى الثاني" },
      { title: "مبادئ علم النفس العام والسلوك البشري", level: "المستوى الثاني" },
    ],
  },
];

const REAL_OFFERINGS_DATA = [
  {
    courseTitle: "حساب التفاضل والتكامل",
    title: "شرح شامل لمقرر التفاضل والتكامل مع حل نماذج الاختبارات السابقة",
    summary: "شرح تفصيلي ومبسط لجميع مفاهيم النهايات والاشتقاق وتطبيقاته والتكامل وحساب المساحات، مع حل التمارين ونماذج الاختبارات الفصلية والنهائية خطوة بخطوة.",
    price: 150,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "مقدمة المقرر والمفاهيم الأساسية للنهايات والاتصال", access: "TRIAL" },
      { title: "قواعد الاشتقاق الأساسية وقاعدة السلسلة والمشتقات العليا", access: "PAID" },
      { title: "تطبيقات الاشتقاق: القيم العظمى والصغرى ورسم المنحنيات ومعدلات التغير", access: "PAID" },
      { title: "التكامل غير المحدد وقواعد التكامل الأساسية والتعويض", access: "PAID" },
      { title: "التكامل المحدد وحساب المساحات بين المنحنيات والحجوم", access: "PAID" },
      { title: "مراجعة شاملة وحل تجميعات الاختبارات الفصلية والنهائية", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "شرح ممتاز وواضح جداً، سهل علي فهم المادة بعد ما كنت مستصعبها واجتزت الاختبار بدرجة A+" },
      { rating: 5, comment: "أفضل دكتور يشرح تفاضل وتكامل بسلاسة وحل النماذج جاء منه في الاختبار الفصلي نصاً." },
      { rating: 5, comment: "أسلوب راقي وشرح مرتب ومفصل، أنصح أي طالب يدرس المقرر يشترك بدون تردد." },
    ],
  },
  {
    courseTitle: "هياكل البيانات والخوارزميات",
    title: "شرح هياكل البيانات والخوارزميات بالتطبيق العملي وحل التمارين البرمجية",
    summary: "دورة مكثفة تغطي القوائم المتصلة، المكدسات، الطوابير، الأشجار الثنائية، وخوارزميات البحث والفرز مع حساب التعقيد الزمني والمكاني وتطبيقات برمجية عملية.",
    price: 190,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "مقدمة في هياكل البيانات وحساب التعقيد الزمني (Big-O)", access: "TRIAL" },
      { title: "المصفوفات والقوائم المتصلة الأحادية والمزدوجة", access: "PAID" },
      { title: "المكدسات (Stack) وقوائم الانتظار (Queue) وتطبيقاتها العملية", access: "PAID" },
      { title: "الأشجار الثنائية وأشجار البحث المتوازنة (BST & AVL)", access: "PAID" },
      { title: "خوارزميات الفرز والبحث المتقدمة وتحليل أدائها", access: "PAID" },
      { title: "حل مشاريع وأسئلة المقابلات والاختبارات السابقة", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "المادة كانت صعبة في الجامعة لكن مع هذا الشرح فهمت كل الخوارزميات ورسمت الأشجار بكل ثقة." },
      { rating: 5, comment: "شرح احترافي وكود واضح ومكتوب خطوة بخطوة. شكراً جزيلاً أستاذنا." },
    ],
  },
  {
    courseTitle: "مبادئ المحاسبة المالية",
    title: "شرح مسار المحاسبة المالية الكامل: من قيود اليومية إلى القوائم المالية",
    summary: "شرح عملي ومبسط للدورة المحاسبية الكاملة: معادلة الميزانية، تسجيل القيود في دفتر اليومية، الترحيل إلى الأستاذ، ميزان المراجعة، والتسويات الجردية حتى إعداد القوائم الختامية.",
    price: 140,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "المفاهيم المحاسبية الأساسية ومعادلة الميزانية والأطراف المدينة والدائنة", access: "TRIAL" },
      { title: "تسجيل العمليات المالية في دفتر اليومية والترحيل لدفتر الأستاذ", access: "PAID" },
      { title: "إعداد ميزان المراجعة واكتشاف الأخطاء المحاسبية وتصحيحها", access: "PAID" },
      { title: "التسويات الجردية للإيرادات والمصروفات والإهلاك", access: "PAID" },
      { title: "إعداد قائمة الدخل وقائمة المركز المالي وحقوق الملكية", access: "PAID" },
      { title: "حل حالات تطبيقية وتمارين شاملة على نمط اختبارات الجامعة", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "شرح متكامل ومبسط جداً للمحاسبة. القيود كانت عقدتي والآن صارت أسهل شيء." },
      { rating: 5, comment: "توضيح القوائم المالية والتسويات كان في قمة الروعة والإتقان." },
    ],
  },
  {
    courseTitle: "الفيزياء العامة للمسار العلمي",
    title: "شرح شامل لمقرر الفيزياء العامة وحل المسائل وبنوك الأسئلة التدريبية",
    summary: "شرح مركز على فهم القوانين الفيزيائية الأساسية: المتجهات، الحركة والقوى، قوانين نيوتن، الشغل والطاقة، مع حل مكثف للمسائل الرياضية والتدريب على الاختبارات.",
    price: 160,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "الوحدات القياسية والتحويلات وتحليل المتجهات", access: "TRIAL" },
      { title: "الحركة في بعد واحد وبعدين ومعادلات الحركة بتسارع ثابت", access: "PAID" },
      { title: "قوانين نيوتن الثلاثة للحركة وتطبيقات قوى الاحتكاك والشد", access: "PAID" },
      { title: "الشغل والطاقة الحركية وطاقة الوضع ومبدأ حفظ الطاقة", access: "PAID" },
      { title: "كمية الحركة الخطية والتصادمات وقوة الدفع", access: "PAID" },
      { title: "حل بنك أسئلة شامل ونماذج اختبارات الأعوام السابقة", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "تبسيط المسائل المعقدة بطريقة رهيبة، الاختبار جاء شبه مطابق لتمارين الدورة." },
    ],
  },
  {
    courseTitle: "قواعد البيانات وتصميمها",
    title: "شرح تصميم قواعد البيانات ولغة SQL بالتطبيق العملي والمشاريع",
    summary: "تعلم تصميم مخططات الكيانات والعلاقات (ERD)، تحويلها إلى جداول علائقية وتطبيعها (Normalization)، وكتابة استعلامات SQL المتقدمة مع الربط وإنشاء الفهارس والإجراءات المخزنة.",
    price: 175,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "مقدمة في نظم إدارة قواعد البيانات ونموذج الكيانات والعلاقات", access: "TRIAL" },
      { title: "تحويل نموذج ERD إلى مخطط علائقي وقواعد التطبيع والتكامل المرجعي", access: "PAID" },
      { title: "أوامر تعريف البيانات (DDL) وإنشاء الجداول والقيود", access: "PAID" },
      { title: "استعلامات استرجاع البيانات (SELECT) والشروط والتجميع والترتيب", access: "PAID" },
      { title: "ربط الجداول (JOINs) والاستعلامات الفرعية والتحديث والحذف", access: "PAID" },
      { title: "مشروع تطبيقي كامل وحل تمارين وتجميعات الجامعة", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "الشرح العملي للـ SQL كان أسطوري، طبقت معه خطوة بخطوة وأخذت الدرجة الكاملة في المشروع." },
    ],
  },
  {
    courseTitle: "مبادئ الاقتصاد الجزئي",
    title: "شرح مبادئ الاقتصاد الجزئي مع تفسير الرسوم والمنحنيات البيانية",
    summary: "شرح وافٍ لقوى السوق: نظرية العرض والطلب وتوازن السوق، مرونة الطلب والعرض، سلوك المستهلك ومنحنيات السواء، وتكاليف الإنتاج وهياكل الأسواق المختلفة.",
    price: 130,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "مقدمة في علم الاقتصاد والمشكلة الاقتصادية ومنحنى إمكانيات الإنتاج", access: "TRIAL" },
      { title: "نظرية العرض والطلب وتوازن السوق وآلية الأسعار", access: "PAID" },
      { title: "مرونات الطلب والعرض: المرونة السعرية والدخلية والتقاطعية", access: "PAID" },
      { title: "سلوك المستهلك: المنفعة الحدية ونظرية منحنيات السواء وخط الدخل", access: "PAID" },
      { title: "دوال الإنتاج وتكاليف الإنتاج في الأجل القصير والطويل", access: "PAID" },
      { title: "هياكل السوق: المنافسة الكاملة، الاحتكار التام، والمنافسة الاحتكارية", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "الرسوم البيانية كانت تلخبطني، لكن الشرح هنا فككها وفهمت سبب حركة كل منحنى بوضوح." },
    ],
  },
  {
    courseTitle: "القانون التجاري والشركات",
    title: "شرح القانون التجاري والشركات وفق أحدث الأنظمة السعودية واللوائح",
    summary: "شرح مفاهيم الأعمال التجارية والتمييز بينها وبين الأعمال المدنية، شروط اكتساب صفة التاجر والتزاماته، والمتجر والعناصر المعنوية، مع دراسة تفصيلية لأشكال الشركات التجارية وتأسيسها وإدارتها.",
    price: 155,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "مقدمة القانون التجاري وتحديد الأعمال التجارية المنفردة وبالمقاولة", access: "TRIAL" },
      { title: "الأعمال التجارية بالتبعية والأعمال المختلطة وآثار التفرقة", access: "PAID" },
      { title: "اكتساب صفة التاجر والتزامات التجار والدفاتر التجارية والقيد في السجل", access: "PAID" },
      { title: "المتجر وعناصره المادية والمعنوية وحمايته والتصرف فيه", access: "PAID" },
      { title: "أشكال الشركات في نظام الشركات السعودي الجديد: التضامن، المساهمة، والمحدودة", access: "PAID" },
      { title: "إدارة الشركات وانقضاؤها وتصفيتها مع دراسة قضايا وحالات عملية", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "شرح نظامي دقيق ومواكب لأحدث تعديلات نظام الشركات السعودي، مجهود يُشكر عليه." },
    ],
  },
  {
    courseTitle: "علم وظائف الأعضاء والأجهزة الحيوية",
    title: "شرح فسيولوجيا أجهزة الجسم الطبية مع المراجعات والرسومات التوضيحية",
    summary: "شرح متكامل لفسيولوجيا الجهاز الدوري والقلب، الجهاز التنفسي وتبادل الغازات، الجهاز الكلوي والتوازن الأسموزي، والجهاز العصبي، بأسلوب طبي منظم وموجّه لطلاب الكليات الصحية.",
    price: 210,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "مقدمة في الفسيولوجيا والبيئة الداخلية وآليات التغذية الراجعة والتوازن", access: "TRIAL" },
      { title: "فسيولوجيا القلب والدورة الدموية والكهربية القلبية وضغط الدم", access: "PAID" },
      { title: "فسيولوجيا الجهاز التنفسي والتهوية الرئوية ونقل الغازات", access: "PAID" },
      { title: "فسيولوجيا الكلى والترشيح وإعادة الامتصاص وتوازن السوائل والأملاح", access: "PAID" },
      { title: "الجهاز العصبي وانتقال السيالات العصبية والتشابكات العصبية", access: "PAID" },
      { title: "مراجعة شاملة وأسئلة بنوك طبية مع التوضيح السريري", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "من أروع الشروحات الطبية، الترابط بين الوظيفة والتطبيق السريري ممتاز جداً." },
    ],
  },
  {
    courseTitle: "الدوائر الكهربائية وتحليلها",
    title: "شرح الدوائر الكهربائية المستمرة والمترددة وحل المسائل التحليلية",
    summary: "شرح قوانين أوم وكيرشوف، طرق التحليل بالعقد والمش الحلقي، نظريات ثيفنين ونورتون والتطابق، ودوائر التيار المتردد والرنين ومعامل القدرة مع حل مسائل اختبارات مكثفة.",
    price: 165,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "المفاهيم الأساسية للجهد والتيار وقوانين كيرشوف وتوصيل المقاومات", access: "TRIAL" },
      { title: "طرق تحليل الدوائر: تحليل جهد العقد (Nodal) والتيارات الحلقية (Mesh)", access: "PAID" },
      { title: "نظريات الدوائر: نظرية التطابق، ثيفنين، نورتون، والحد الأقصى لنقل القدرة", access: "PAID" },
      { title: "المكثفات والملفات ودوائر الاستجابة العابرة من الرتبة الأولى (RC & RL)", access: "PAID" },
      { title: "تحليل دوائر التيار المتردد الجيبية باستخدام المتجهات الطورية والممانعات", access: "PAID" },
      { title: "القدرة في دوائر التيار المتردد ومعامل القدرة وحل نماذج الاختبارات النهائية", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "تحليل ثيفنين ونورتون كنت أعاني فيه كثير، الشرح فكك المسائل المعقدة ووضح طريقة الحل النظامية." },
    ],
  },
  {
    courseTitle: "الكيمياء العامة وتطبيقاتها",
    title: "شرح الكيمياء العامة مع حل مسائل الحسابات الكيميائية والاتزان",
    summary: "شرح التركيب الذري والروابط الكيميائية، الحسابات الكيميائية والمول، الغازات وقوانينها، الاتزان الكيميائي ومحاليل الأحماض والقواعد والديناميكا الحرارية الكيميائية.",
    price: 145,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "المادة وقياساتها والتركيب الذري والجدول الدوري وتوزيع الإلكترونات", access: "TRIAL" },
      { title: "الروابط الكيميائية والتسمية والمعادلات الكيميائية ومفهوم المول", access: "PAID" },
      { title: "الحسابات الكيميائية والنسبة المئوية والمحدد للتفاعل والناتج الفعلي", access: "PAID" },
      { title: "قوانين الغازات المثالية والنظرية الحركية للجزيئات", access: "PAID" },
      { title: "الاتزان الكيميائي وقاعدة لوشاتيليه ومحاليل الأحماض والقواعد وحساب الـ pH", access: "PAID" },
      { title: "حل تجميعات الاختبارات الفصلية والنهائية والتجارب المعملية", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "شرح سلس جداً للحسابات الكيميائية ومسائل الاتزان، أنصح به بشدة." },
    ],
  },
  {
    courseTitle: "أساسيات الأمن السيبراني",
    title: "شرح أساسيات الأمن السيبراني وحماية الشبكات وتأمين الأنظمة",
    summary: "دورة شاملة في مبادئ أمن المعلومات (مثلث CIA)، أنواع الهجمات السيبرانية، تقنيات التشفير المتماثل وغير المتماثل، جدران الحماية، والسياسات الأمنية والاستجابة للحوادث.",
    price: 195,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "مقدمة الأمن السيبراني ومفاهيم السرية والنزاهة والتوافر", access: "TRIAL" },
      { title: "أنواع التهديدات والهجمات السيبرانية: الهندسة الاجتماعية والبرمجيات الخبيثة", access: "PAID" },
      { title: "أساسيات التشفير والمفاتيح العامة والخاصة والتوقيع الرقمي والشهادات", access: "PAID" },
      { title: "أمن الشبكات وجدران الحماية وأنظمة كشف التسلل (IDS/IPS)", access: "PAID" },
      { title: "إدارة الثغرات الأمنية واختبار الاختراق الأخلاقي", access: "PAID" },
      { title: "إدارة المخاطر والامتثال والاستجابة للحوادث السيبرانية", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "محتوى قوي وشرح عملي ممتاز جداً يربط المفاهيم النظرية بالواقع التقني." },
    ],
  },
  {
    courseTitle: "مبادئ الذكاء الاصطناعي",
    title: "شرح مبادئ الذكاء الاصطناعي وخوارزميات البحث وتعلم الآلة",
    summary: "مقدمة في الوكلاء الأذكياء، خوارزميات البحث في فضاء الحالات، خوارزميات البحث المستنير، المنطق وتمثيل المعرفة، ومقدمة في الشبكات العصبية وتعلم الآلة مع تطبيقات عملية.",
    price: 210,
    trialVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessons: [
      { title: "مقدمة في الذكاء الاصطناعي والوكلاء الأذكياء والبيئات المختلفة", access: "TRIAL" },
      { title: "خوارزميات البحث غير المستنير: البحث بالعمق والاتساع والتكلفة الموحدة", access: "PAID" },
      { title: "خوارزميات البحث المستنير وخوارزمية A* والدوال الإرشادية", access: "PAID" },
      { title: "مسائل استيفاء القيود (CSP) والألعاب والبحث التنافسي (Minimax & Alpha-Beta)", access: "PAID" },
      { title: "مقدمة في التعلم الخاضع للإشراف والانحدار والتصنيف", access: "PAID" },
      { title: "مقدمة في الشبكات العصبية الاصطناعية وحل المسائل البرمجية", access: "PAID" },
    ],
    reviews: [
      { rating: 5, comment: "شرح خوارزميات البحث ومسائل الـ Minimax كان الأفضل على الإطلاق، فهمت كل التفاصيل." },
    ],
  },
];

const TEACHERS_SEED = [
  {
    fullName: "د. خالد الشمري",
    username: "dr_khaled",
    email: "khaled.shammari@siraj.sa",
    degree: "دكتوراه في علوم الحاسب والذكاء الاصطناعي",
    bio: "أستاذ جامعي وباحث في مجال الخوارزميات والذكاء الاصطناعي والأمن السيبراني، خبرة أكثر من 10 سنوات في تدريس مقررات الحوسبة وهياكل البيانات وقواعد البيانات لطلاب الجامعات السعودية.",
    specialties: ["علوم الحاسب", "الذكاء الاصطناعي", "هياكل البيانات", "الأمن السيبراني"],
  },
  {
    fullName: "أ. سارة القحطاني",
    username: "sarah_math",
    email: "sarah.qahtani@siraj.sa",
    degree: "ماجستير في الرياضيات التطبيقية والإحصاء",
    bio: "معلمة ومحاضرة متخصصة في تبسيط مقررات التفاضل والتكامل، الجبر الخطي، والإحصاء والاحتمالات، مئات الطلاب والطالبات اجتازوا مقرراتهم معي بدرجات متميزة وامتياز.",
    specialties: ["الرياضيات", "حساب التفاضل والتكامل", "الجبر الخطي", "الإحصاء"],
  },
  {
    fullName: "د. عبد العزيز المطيري",
    username: "dr_abdulaziz",
    email: "abdulaziz.mutairi@siraj.sa",
    degree: "دكتوراه في المحاسبة والعلوم المالية",
    bio: "مستشار مالي وأستاذ محاسبة جامعي، متخصص في تدريس المحاسبة المالية ومحاسبة التكاليف والإدارة المالية والاقتصاد، مع ربط المناهج بالمعايير المهنية والتطبيقات الواقعية.",
    specialties: ["المحاسبة المالية", "محاسبة التكاليف", "الإدارة المالية", "الاقتصاد"],
  },
  {
    fullName: "م. فهد العتيبي",
    username: "eng_fahad",
    email: "fahad.otaibi@siraj.sa",
    degree: "ماجستير في الهندسة الكهربائية والإلكترونيات",
    bio: "مهندس ومحاضر جامعي متخصص في تحليل الدوائر الكهربائية والإلكترونيات وأنظمة التحكم، أسلوب تدريسي يركز على الفهم الهندسي العميق وحل المسائل بأبسط الطرق.",
    specialties: ["الهندسة الكهربائية", "الدوائر الكهربائية", "الفيزياء العامة", "الإلكترونيات"],
  },
  {
    fullName: "د. نورة الغامدي",
    username: "dr_noura",
    email: "noura.ghamdi@siraj.sa",
    degree: "دكتوراه في العلوم الطبية والصيدلانية",
    bio: "أستاذة مساعدة في كلية الطب والعلوم الصحية، متخصصة في تدريس علم وظائف الأعضاء، علم الأدوية، والكيمياء الحيوية لطلاب الطب والصيدلة والعلوم الطبية التطبيقية.",
    specialties: ["العلوم الطبية", "علم وظائف الأعضاء", "علم الأدوية", "الكيمياء العامة"],
  },
  {
    fullName: "أ. محمد الدوسري",
    username: "adv_mohammed",
    email: "mohammed.dossari@siraj.sa",
    degree: "ماجستير في القانون التجاري والأنظمة",
    bio: "محامٍ وباحث قانوني، محاضر في القانون التجاري والمدني وأنظمة الشركات السعودية، متمكن من شرح المواد النظامية وصياغة العقود وتطبيقات القضايا العملية.",
    specialties: ["القانون التجاري", "الأنظمة واللوائح", "القانون المدني", "الشركات"],
  },
];

async function main() {
  console.log("=== بدء إضافة البيانات الحقيقية السريعة (Bulk) ===");

  const universities = await prisma.university.findMany({ orderBy: { order: "asc" } });
  console.log(`عدد الجامعات: ${universities.length}`);

  // 1) الكليات بالجملة (createMany)
  const existingColleges = await prisma.college.findMany({ select: { id: true, universityId: true, name: true } });
  const collegeMap = new Map<string, string>();
  existingColleges.forEach((c) => collegeMap.set(`${c.universityId}::${c.name}`, c.id));

  const newCollegesData = [];
  for (const uni of universities) {
    for (const cData of COLLEGES_DATA) {
      if (!collegeMap.has(`${uni.id}::${cData.name}`)) {
        newCollegesData.push({ universityId: uni.id, name: cData.name });
      }
    }
  }

  if (newCollegesData.length > 0) {
    console.log(`إضافة ${newCollegesData.length} كلية جديدة دفعة واحدة...`);
    await prisma.college.createMany({ data: newCollegesData, skipDuplicates: true });
    const allColleges = await prisma.college.findMany({ select: { id: true, universityId: true, name: true } });
    allColleges.forEach((c) => collegeMap.set(`${c.universityId}::${c.name}`, c.id));
  }

  // 2) التخصصات بالجملة (createMany)
  const existingMajors = await prisma.major.findMany({ select: { id: true, universityId: true, name: true } });
  const majorSet = new Set<string>();
  existingMajors.forEach((m) => majorSet.add(`${m.universityId}::${m.name}`));

  const newMajorsData = [];
  for (const uni of universities) {
    for (const cData of COLLEGES_DATA) {
      const collegeId = collegeMap.get(`${uni.id}::${cData.name}`);
      for (const mName of cData.majors) {
        if (!majorSet.has(`${uni.id}::${mName}`)) {
          newMajorsData.push({ universityId: uni.id, collegeId, name: mName });
          majorSet.add(`${uni.id}::${mName}`);
        }
      }
    }
  }

  if (newMajorsData.length > 0) {
    console.log(`إضافة ${newMajorsData.length} تخصص جديد دفعة واحدة...`);
    await prisma.major.createMany({ data: newMajorsData, skipDuplicates: true });
  }

  // 3) المقررات بالجملة (createMany)
  const existingCourses = await prisma.course.findMany({ select: { universityId: true, title: true } });
  const courseSet = new Set<string>();
  existingCourses.forEach((c) => courseSet.add(`${c.universityId}::${c.title}`));

  const newCoursesData = [];
  for (const uni of universities) {
    for (const cData of COLLEGES_DATA) {
      const collegeId = collegeMap.get(`${uni.id}::${cData.name}`);
      for (const crs of cData.courses) {
        if (!courseSet.has(`${uni.id}::${crs.title}`)) {
          newCoursesData.push({
            universityId: uni.id,
            collegeId,
            title: crs.title,
            level: crs.level,
            code: null, // لا كود — فقط اسم بشري نظيف
            isVisible: true,
            description: `مقرر ${crs.title} لطلاب ${uni.name}، يشمل موضوعات وتطبيقات ${crs.level}.`,
          });
          courseSet.add(`${uni.id}::${crs.title}`);
        }
      }
    }
  }

  if (newCoursesData.length > 0) {
    console.log(`إضافة ${newCoursesData.length} مقرر جديد دفعة واحدة...`);
    // تقسيم المقررات لحزم من 500 لتفادي حد استعلامات PostgreSQL
    for (let i = 0; i < newCoursesData.length; i += 500) {
      const chunk = newCoursesData.slice(i, i + 500);
      await prisma.course.createMany({ data: chunk, skipDuplicates: true });
    }
  }

  console.log("تم تحديث الجامعات والكليات والتخصصات والمقررات بالكامل!");

  // 4) المدرسون المعتمدون
  // اعتماد الحساب الموجود (إن وُجد)
  await prisma.teacherProfile.updateMany({
    where: { status: "PENDING" },
    data: { status: "APPROVED" },
  });

  const teacherProfiles = [];
  const currentTeachers = await prisma.teacherProfile.findMany({
    where: { status: "APPROVED" },
    include: { user: true },
  });
  teacherProfiles.push(...currentTeachers);

  for (const tSeed of TEACHERS_SEED) {
    let user = await prisma.user.findFirst({
      where: { OR: [{ email: tSeed.email }, { username: tSeed.username }] },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          fullName: tSeed.fullName,
          username: tSeed.username,
          email: tSeed.email,
          passwordHash: await bcrypt.hash("Siraj@Teacher2026", 10),
          role: "TEACHER",
          status: "ACTIVE",
          emailVerified: true,
        },
      });
    }

    let profile = await prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      include: { user: true },
    });

    if (!profile) {
      profile = await prisma.teacherProfile.create({
        data: {
          userId: user.id,
          degree: tSeed.degree,
          bio: tSeed.bio,
          specialties: tSeed.specialties,
          status: "APPROVED",
        },
        include: { user: true },
      });
      teacherProfiles.push(profile);
    } else if (profile.status !== "APPROVED") {
      profile = await prisma.teacherProfile.update({
        where: { id: profile.id },
        data: { status: "APPROVED" },
        include: { user: true },
      });
      teacherProfiles.push(profile);
    }
  }

  // 5) الدورات والدروس والتقييمات
  const reviewersData = [
    { fullName: "عبد الرحمن التميمي", username: "abdulrahman_t", email: "abdulrahman@siraj.sa" },
    { fullName: "فيصل الشهري", username: "faisal_sh", email: "faisal@siraj.sa" },
    { fullName: "ريناد الحربي", username: "renad_h", email: "renad@siraj.sa" },
  ];
  const reviewers = [];
  for (const r of reviewersData) {
    let u = await prisma.user.findFirst({ where: { email: r.email } });
    if (!u) {
      u = await prisma.user.create({
        data: {
          fullName: r.fullName,
          username: r.username,
          email: r.email,
          passwordHash: await bcrypt.hash("Student@2026!", 10),
          role: "STUDENT",
          status: "ACTIVE",
          emailVerified: true,
        },
      });
    }
    reviewers.push(u);
  }

  for (let idx = 0; idx < REAL_OFFERINGS_DATA.length; idx++) {
    const oData = REAL_OFFERINGS_DATA[idx];
    const course = await prisma.course.findFirst({
      where: { title: { contains: oData.courseTitle } },
    });

    if (!course) continue;

    const teacher = teacherProfiles[idx % teacherProfiles.length];

    let offering = await prisma.courseOffering.findFirst({
      where: { courseId: course.id, teacherId: teacher.id },
    });

    if (!offering) {
      offering = await prisma.courseOffering.create({
        data: {
          courseId: course.id,
          teacherId: teacher.id,
          title: oData.title,
          summary: oData.summary,
          price: oData.price,
          trialVideoUrl: oData.trialVideoUrl,
          status: "PUBLISHED",
          accessType: "PAID",
        },
      });

      for (let lIdx = 0; lIdx < oData.lessons.length; lIdx++) {
        const l = oData.lessons[lIdx];
        await prisma.lesson.create({
          data: {
            offeringId: offering.id,
            title: l.title,
            videoUrl: oData.trialVideoUrl,
            access: l.access === "TRIAL" ? "TRIAL" : "PAID",
            order: lIdx + 1,
          },
        });
      }

      for (let rIdx = 0; rIdx < oData.reviews.length; rIdx++) {
        const rev = oData.reviews[rIdx];
        const reviewer = reviewers[rIdx % reviewers.length];
        await prisma.review.upsert({
          where: {
            offeringId_userId: {
              offeringId: offering.id,
              userId: reviewer.id,
            },
          },
          update: {
            rating: rev.rating,
            comment: rev.comment,
          },
          create: {
            offeringId: offering.id,
            userId: reviewer.id,
            rating: rev.rating,
            comment: rev.comment,
          },
        });
      }
    }
  }

  const finalColleges = await prisma.college.count();
  const finalMajors = await prisma.major.count();
  const finalCourses = await prisma.course.count();
  const finalOfferings = await prisma.courseOffering.count();

  console.log(`\n=== النتائج النهائية في قاعدة البيانات ===`);
  console.log(`الجامعات: ${universities.length}`);
  console.log(`الكليات: ${finalColleges}`);
  console.log(`التخصصات: ${finalMajors}`);
  console.log(`المقررات: ${finalCourses}`);
  console.log(`الدورات المعروضة: ${finalOfferings}`);
}

main()
  .catch((e) => {
    console.error("فشل تنفيذ الإضافة:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
