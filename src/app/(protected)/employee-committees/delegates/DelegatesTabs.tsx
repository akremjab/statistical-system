
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

// التبويبان المعتمدان لإدارة المندوبين وتكليفاتهم.
type TabName = "delegates" | "assignments";
// بيانات الجهة المؤهلة للتكليف كما يرجعها API.
// نستخدم المعرّف عند الحفظ، والاسم للعرض في القائمة.
type EligibleEntity = {
    id: string;
    name: string;
};
type DelegateRecord = {
    id: string;
    full_name: string;
    national_number: string;
    employee_number: string;
    academic_qualification: string;
    actual_service_years: number;
    passed_qualification_course: boolean;
    phone_number: string;
    original_workplace: string;
    notes: string | null;
    created_at: string;
};

// بيانات تكليف المندوب كما يرجعها API من PostgreSQL.
// نحتفظ بالمعرّفات كنصوص لتجنب فقدان دقة BIGINT.
type DelegateAssignmentRecord = {
    id: string;
    delegate_id: string;
    delegate_name: string;
    administrative_entity_id: string;
    administrative_entity_name: string;
    assignment_reference: string;
    assignment_date: string;
    status: "ساري" | "منتهٍ";
    ended_at: string | null;
    notes: string | null;
    created_at: string;
};
export default function DelegatesTabs() {
    const [activeTab, setActiveTab] = useState<TabName>("delegates");
    const [savingDelegate, setSavingDelegate] = useState(false);
    const [delegateMessage, setDelegateMessage] = useState<{ success: boolean; text: string } | null>(null);
    const delegateRequestKey = useRef<string | null>(null);
    const savingLock = useRef(false);
    const [delegates, setDelegates] = useState<DelegateRecord[]>([]);
    const [delegateSearch, setDelegateSearch] = useState("");
    const [loadingDelegates, setLoadingDelegates] = useState(true);
    const [delegatesError, setDelegatesError] = useState<string | null>(null);
    const [delegatesRefresh, setDelegatesRefresh] = useState(0);
    // قائمة الجهات الإدارية ذات الذمة المالية المستقلة.
    const [eligibleEntities, setEligibleEntities] = useState<EligibleEntity[]>([]);
    // قائمة مستقلة لاختيار المندوبين عند إنشاء التكليفات.
    // لا تتأثر بعبارة البحث في جدول بيانات المندوبين.
    const [assignmentDelegates, setAssignmentDelegates] = useState<DelegateRecord[]>([]);
    const [loadingAssignmentDelegates, setLoadingAssignmentDelegates] = useState(false);
    const [assignmentDelegatesError, setAssignmentDelegatesError] = useState<string | null>(null);
    // حالات التحميل والأخطاء مستقلة عن جدول المندوبين.
    const [loadingEligibleEntities, setLoadingEligibleEntities] = useState(false);
    const [eligibleEntitiesError, setEligibleEntitiesError] = useState<string | null>(null);

    // التكليفات المسجلة والمسترجعة من قاعدة بيانات PostgreSQL.
    const [assignments, setAssignments] = useState<DelegateAssignmentRecord[]>([]);

    // حالة تحميل جدول التكليفات.
    const [loadingAssignments, setLoadingAssignments] = useState(false);

    // رسالة الخطأ عند تعذر جلب التكليفات.
    const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

    // عداد لإعادة تحميل التكليفات بعد نجاح عملية الحفظ.
    const [assignmentsRefresh, setAssignmentsRefresh] = useState(0);

    // نص البحث الذي يكتبه المستخدم في التكليفات المسجلة.
    const [assignmentSearch, setAssignmentSearch] = useState("");

    // نص البحث المعتمد لإرسال الطلب إلى PostgreSQL.
    // يتأخر تحديثه قليلًا لتجنب إرسال طلب مع كل حرف.
    const [debouncedAssignmentSearch, setDebouncedAssignmentSearch] =
        useState("");

    // تصفية التكليفات حسب الحالة.
    const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<
        "all" | "active" | "ended"
    >("all");

    // الصفحة الحالية في جدول تكليفات المندوبين.
    const [assignmentsPage, setAssignmentsPage] = useState(1);

    // إجمالي عدد التكليفات المطابقة للبحث والتصفية.
    const [assignmentsTotal, setAssignmentsTotal] = useState(0);

    // إجمالي عدد الصفحات الذي يرجعه الخادم.
    const [assignmentsTotalPages, setAssignmentsTotalPages] = useState(0);
    // نتائج البحث والتصفية تأتي مباشرة من PostgreSQL.
    // لا نعيد تصفيتها محليًا حتى لا تختلف عن إجمالي النتائج
    // وعدد الصفحات اللذين يرجعهما الخادم.
    const filteredAssignments = assignments;

    // حالات حفظ تكليف المندوب مستقلة عن حفظ بيانات المندوب.
    const [savingAssignment, setSavingAssignment] = useState(false);

    const [assignmentMessage, setAssignmentMessage] = useState<{
        success: boolean;
        text: string;
    } | null>(null);

    // ربط مفتاح منع التكرار بمحتوى الطلب نفسه.
    // عند إعادة إرسال نفس البيانات نستخدم المفتاح السابق.
    const assignmentRequest = useRef<{
        key: string;
        payload: string;
    } | null>(null);

    // منع الضغط المتكرر على زر الحفظ أثناء تنفيذ الطلب.
    const assignmentSavingLock = useRef(false);
    // تأخير البحث 350 مللي ثانية بعد آخر تغيير في النص.
    // يتم إلغاء المؤقت السابق عند استمرار المستخدم في الكتابة.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedAssignmentSearch(assignmentSearch);
        }, 350);

        return () => clearTimeout(timer);
    }, [assignmentSearch]);

    // تحميل التكليفات من PostgreSQL مع البحث والتصفية والترقيم.
    // تُلغى الطلبات القديمة عند تغيير البحث أو الصفحة.
    useEffect(() => {
        if (activeTab !== "assignments") return;

        const controller = new AbortController();

        async function loadAssignments() {
            setLoadingAssignments(true);
            setAssignmentsError(null);

            try {
                const params = new URLSearchParams({
                    search: debouncedAssignmentSearch.trim(),
                    status: assignmentStatusFilter,
                    page: String(assignmentsPage),
                });

                const response = await fetch(
                    `/api/committee-delegate-assignments?${params.toString()}`,
                    {
                        method: "GET",
                        credentials: "same-origin",
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                const result: unknown = await response.json();

                const parsed =
                    result && typeof result === "object"
                        ? (result as {
                            success?: boolean;
                            assignments?: DelegateAssignmentRecord[];
                            pagination?: {
                                page: number;
                                pageSize: number;
                                total: number;
                                totalPages: number;
                            };
                            error?: string;
                        })
                        : {};

                if (
                    !response.ok ||
                    !parsed.success ||
                    !Array.isArray(parsed.assignments) ||
                    !parsed.pagination ||
                    !Number.isSafeInteger(parsed.pagination.total) ||
                    !Number.isSafeInteger(parsed.pagination.totalPages)
                ) {
                    throw new Error(
                        parsed.error ??
                        "تعذر تحميل تكليفات المندوبين."
                    );
                }

                if (!controller.signal.aborted) {
                    const totalPages = parsed.pagination.totalPages;

                    // إذا أصبحت الصفحة المطلوبة خارج نطاق النتائج،
                    // ننتقل إلى آخر صفحة متاحة ونعيد تحميل بياناتها.
                    if (
                        totalPages > 0 &&
                        assignmentsPage > totalPages
                    ) {
                        setAssignmentsPage(totalPages);
                        return;
                    }

                    // عند عدم وجود نتائج، نعود للصفحة الأولى.
                    if (totalPages === 0 && assignmentsPage !== 1) {
                        setAssignmentsPage(1);
                        return;
                    }

                    setAssignments(parsed.assignments);
                    setAssignmentsTotal(parsed.pagination.total);
                    setAssignmentsTotalPages(totalPages);
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setAssignments([]);
                    setAssignmentsTotal(0);
                    setAssignmentsTotalPages(0);

                    setAssignmentsError(
                        error instanceof Error
                            ? error.message
                            : "تعذر تحميل تكليفات المندوبين."
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoadingAssignments(false);
                }
            }
        }

        void loadAssignments();

        return () => controller.abort();
    }, [
        activeTab,
        assignmentsRefresh,
        debouncedAssignmentSearch,
        assignmentStatusFilter,
        assignmentsPage,
    ]);

    // تحميل قائمة المندوبين بصورة مستقلة عند فتح تبويب التكليفات.
    // إلغاء الطلب يمنع تحديث الحالة بعد مغادرة التبويب.
    useEffect(() => {
        if (activeTab !== "assignments") return;

        const controller = new AbortController();

        async function loadAssignmentDelegates() {
            setLoadingAssignmentDelegates(true);
            setAssignmentDelegatesError(null);

            try {
                const response = await fetch(
                    "/api/committee-delegates",
                    {
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                const result: unknown = await response.json();

                const parsed =
                    result && typeof result === "object"
                        ? result as {
                            success?: boolean;
                            delegates?: DelegateRecord[];
                            error?: string;
                        }
                        : {};

                if (!response.ok || !parsed.success || !Array.isArray(parsed.delegates)) {
                    throw new Error(
                        parsed.error ?? "تعذر تحميل قائمة المندوبين."
                    );
                }

                if (!controller.signal.aborted) {
                    setAssignmentDelegates(parsed.delegates);
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setAssignmentDelegates([]);
                    setAssignmentDelegatesError(
                        error instanceof Error
                            ? error.message
                            : "تعذر تحميل قائمة المندوبين."
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoadingAssignmentDelegates(false);
                }
            }
        }

        void loadAssignmentDelegates();

        return () => controller.abort();
    }, [activeTab]);
    // تحميل الجهات المؤهلة عند فتح تبويب التكليفات.
    // لا نحمّل القائمة قبل الحاجة إليها، ولا نسمح لطلب قديم
    // بتحديث الواجهة بعد الانتقال إلى تبويب آخر.
    useEffect(() => {
        if (activeTab !== "assignments") return;

        const controller = new AbortController();

        async function loadEligibleEntities() {
            setLoadingEligibleEntities(true);
            setEligibleEntitiesError(null);

            try {
                const response = await fetch(
                    "/api/committee-delegate-assignments/eligible-entities",
                    {
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                const result: unknown = await response.json();

                const parsed =
                    result && typeof result === "object"
                        ? result as {
                            success?: boolean;
                            entities?: EligibleEntity[];
                            error?: string;
                        }
                        : {};

                if (!response.ok || !parsed.success || !Array.isArray(parsed.entities)) {
                    throw new Error(
                        parsed.error ?? "تعذر تحميل الجهات الإدارية المؤهلة."
                    );
                }

                if (!controller.signal.aborted) {
                    setEligibleEntities(parsed.entities);
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setEligibleEntities([]);
                    setEligibleEntitiesError(
                        error instanceof Error
                            ? error.message
                            : "تعذر تحميل الجهات الإدارية المؤهلة."
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoadingEligibleEntities(false);
                }
            }
        }

        void loadEligibleEntities();

        return () => controller.abort();
    }, [activeTab]);
    useEffect(() => {
        const controller = new AbortController();

        const timer = window.setTimeout(async () => {
            setLoadingDelegates(true);
            setDelegatesError(null);

            try {
                const response = await fetch(
                    `/api/committee-delegates?search=${encodeURIComponent(delegateSearch)}`,
                    {
                        signal: controller.signal,
                        cache: "no-store"
                    }
                );

                const result: unknown = await response.json();

                const parsed = result && typeof result === "object"
                    ? result as {
                        success?: boolean;
                        delegates?: DelegateRecord[];
                        error?: string;
                    }
                    : {};

                if (!response.ok || !parsed.success || !Array.isArray(parsed.delegates)) {
                    throw new Error(parsed.error ?? "تعذر تحميل بيانات المندوبين.");
                }

                if (!controller.signal.aborted) {
                    setDelegates(parsed.delegates);
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setDelegates([]);
                    setDelegatesError(
                        error instanceof Error
                            ? error.message
                            : "تعذر تحميل بيانات المندوبين."
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoadingDelegates(false);
                }
            }
        }, 300);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [delegateSearch, delegatesRefresh]);
    async function saveDelegate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (savingLock.current) return;

        const form = event.currentTarget;
        const data = new FormData(form);
        const yearsText = String(data.get("actualServiceYears") ?? "").trim();
        const qualification = data.get("passedQualificationCourse");

        if (!/^\d+$/.test(yearsText) || Number(yearsText) > 80) {
            setDelegateMessage({ success: false, text: "سنوات الخدمة يجب أن تكون عددًا صحيحًا بين 0 و80." });
            return;
        }
        if (qualification !== "yes" && qualification !== "no") {
            setDelegateMessage({ success: false, text: "يرجى تحديد حالة اجتياز الدورة التأهيلية." });
            return;
        }

        const payload = {
            fullName: String(data.get("fullName") ?? "").trim(),
            nationalNumber: String(data.get("nationalNumber") ?? "").trim(),
            employeeNumber: String(data.get("employeeNumber") ?? "").trim(),
            academicQualification: String(data.get("academicQualification") ?? "").trim(),
            actualServiceYears: Number(yearsText),
            passedQualificationCourse: qualification === "yes",
            phoneNumber: String(data.get("phoneNumber") ?? "").trim(),
            originalWorkplace: String(data.get("originalWorkplace") ?? "").trim(),
            notes: String(data.get("notes") ?? "").trim(),
        };

        savingLock.current = true;
        setSavingDelegate(true);
        setDelegateMessage(null);
        const key = delegateRequestKey.current ?? crypto.randomUUID();
        delegateRequestKey.current = key;

        try {
            const response = await fetch("/api/committee-delegates", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": key,
                },
                body: JSON.stringify(payload),
            });
            const result: unknown = await response.json();
            const parsed = result && typeof result === "object" ? result as {
                success?: boolean; message?: string; error?: string;
            } : {};

            if (!response.ok || !parsed.success) {
                // عند أخطاء التحقق، يمكن للمستخدم تصحيح البيانات وإرسال طلب جديد.
                if (response.status >= 400 && response.status < 500) {
                    delegateRequestKey.current = null;
                }
                setDelegateMessage({
                    success: false,
                    text: parsed.error ?? "تعذر حفظ بيانات المندوب. حاول مجددًا.",
                });
                return;
            }

            delegateRequestKey.current = null;
            form.reset();

            // تحديث جدول المندوبين بعد تأكيد نجاح الحفظ من الخادم.
            // تغيير هذا العداد يعيد تشغيل useEffect لجلب أحدث البيانات.
            // لا نضيف السجل محليًا حتى تبقى قاعدة البيانات المصدر المعتمد.
            setDelegatesRefresh((previous) => previous + 1);

            setDelegateMessage({
                success: true,
                text: parsed.message ?? "تم حفظ بيانات المندوب بنجاح.",
            });
        } catch {
            // نحتفظ بمفتاح العملية نفسه عند تعطل الشبكة لإعادة المحاولة بأمان.
            setDelegateMessage({
                success: false,
                text: "تعذر الاتصال بالخادم. راجع الاتصال ثم حاول مجددًا دون تغيير البيانات.",
            });
        } finally {
            savingLock.current = false;
            setSavingDelegate(false);
        }
    }

    // حفظ تكليف المندوب مع حماية إعادة المحاولة ومنع التكرار.
    async function saveAssignment(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        // منع تنفيذ أكثر من طلب حفظ في الوقت نفسه.
        if (assignmentSavingLock.current) return;

        const form = event.currentTarget;
        const data = new FormData(form);

        const payload = {
            delegateId: String(data.get("delegateId") ?? "").trim(),
            administrativeEntityId: String(
                data.get("administrativeEntityId") ?? ""
            ).trim(),
            assignmentReference: String(
                data.get("assignmentReference") ?? ""
            ).trim(),
            assignmentDate: String(
                data.get("assignmentDate") ?? ""
            ).trim(),
            notes: String(data.get("assignmentNotes") ?? "").trim(),
        };

        // التحقق الأولي من الحقول المطلوبة.
        if (
            !/^[1-9]\d*$/.test(payload.delegateId) ||
            !/^[1-9]\d*$/.test(payload.administrativeEntityId) ||
            !payload.assignmentReference ||
            !payload.assignmentDate
        ) {
            setAssignmentMessage({
                success: false,
                text: "يرجى استكمال بيانات التكليف المطلوبة بصورة صحيحة.",
            });
            return;
        }

        // تمثيل البيانات بصورة ثابتة للمقارنة عند إعادة المحاولة.
        const payloadText = JSON.stringify(payload);

        // نفس البيانات تعني نفس مفتاح العملية.
        // البيانات المختلفة تعني طلبًا جديدًا بمفتاح جديد.
        const previousRequest = assignmentRequest.current;

        const request =
            previousRequest?.payload === payloadText
                ? previousRequest
                : {
                    key: crypto.randomUUID(),
                    payload: payloadText,
                };

        assignmentRequest.current = request;

        assignmentSavingLock.current = true;
        setSavingAssignment(true);
        setAssignmentMessage(null);

        try {
            const response = await fetch(
                "/api/committee-delegate-assignments",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                        "Idempotency-Key": request.key,
                    },
                    body: request.payload,
                }
            );

            const result: unknown = await response.json();

            const parsed =
                result && typeof result === "object"
                    ? (result as {
                        success?: boolean;
                        message?: string;
                        error?: string;
                        alreadyProcessed?: boolean;
                    })
                    : {};

            if (!response.ok || !parsed.success) {
                // عند وجود خطأ مؤكد في التحقق، يمكن إنشاء طلب جديد.
                // أما أخطاء الخادم أو الاتصال فنحتفظ فيها بمفتاح الطلب.
                if (
                    response.status === 400 ||
                    response.status === 403 ||
                    response.status === 415 ||
                    response.status === 422
                ) {
                    assignmentRequest.current = null;
                }

                setAssignmentMessage({
                    success: false,
                    text:
                        parsed.error ??
                        "تعذر حفظ التكليف. يرجى مراجعة البيانات والمحاولة مجددًا.",
                });

                return;
            }

            // نجاح الحفظ أو تأكيد أن الطلب نفسه محفوظ سابقًا.
            assignmentRequest.current = null;

            form.reset();

            // تحديث جدول التكليفات من PostgreSQL بعد تأكيد نجاح الحفظ.
            // نعود لجميع التكليفات والصفحة الأولى لعرض أحدث سجل محفوظ.
            // إعادة التحميل تشمل تحديث حالة التكليف السابق إلى "منتهٍ".
            setAssignmentSearch("");
            setAssignmentStatusFilter("all");
            setAssignmentsPage(1);
            setAssignmentsRefresh((previous) => previous + 1);

            setAssignmentMessage({
                success: true,
                text:
                    parsed.message ??
                    (parsed.alreadyProcessed
                        ? "سبق حفظ هذا التكليف بنفس الطلب."
                        : "تم حفظ تكليف المندوب بنجاح."),
            });
        } catch {
            // عند انقطاع الاتصال لا نعرف يقينًا هل تم الحفظ أم لا.
            // لذلك نحتفظ بالمفتاح لإعادة إرسال الطلب نفسه بأمان.
            setAssignmentMessage({
                success: false,
                text:
                    "تعذر التأكد من نتيجة الحفظ بسبب مشكلة في الاتصال. أعد المحاولة بنفس البيانات للتحقق من العملية.",
            });
        } finally {
            assignmentSavingLock.current = false;
            setSavingAssignment(false);
        }
    }
    const tabStyle = (selected: boolean): React.CSSProperties => ({
        padding: "11px 20px",
        borderRadius: 8,
        border: selected ? "1px solid #17365d" : "1px solid #cbd5e1",
        background: selected ? "#17365d" : "#ffffff",
        color: selected ? "#ffffff" : "#475569",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
    });

    return (
        <section style={{ marginTop: 24 }}>
            {/* أزرار التبديل بين التبويبين */}
            <div
                role="tablist"
                aria-label="أقسام إدارة اللجان والمندوبين"
                style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "delegates"}
                    disabled={savingAssignment}
                    onClick={() => {
                        if (!assignmentSavingLock.current) {
                            setActiveTab("delegates");
                        }
                    }}
                    style={{
                        ...tabStyle(activeTab === "delegates"),
                        opacity: savingAssignment ? 0.6 : 1,
                        cursor: savingAssignment ? "not-allowed" : "pointer",
                    }}
                >
                    بيانات المندوبين
                </button>

                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "assignments"}
                    disabled={savingAssignment}
                    onClick={() => {
                        if (!assignmentSavingLock.current) {
                            setActiveTab("assignments");
                        }
                    }}
                    style={{
                        ...tabStyle(activeTab === "assignments"),
                        opacity: savingAssignment ? 0.6 : 1,
                        cursor: savingAssignment ? "not-allowed" : "pointer",
                    }}
                >
                    تكليفات المندوبين
                </button>
            </div>

            {/* محتوى التبويب المحدد */}
            <div
                role="tabpanel"
                style={{
                    marginTop: 16,
                    padding: 24,
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                }}
            >

                {activeTab === "delegates" ? (
                    // مفتاح مستقل يمنع React من إعادة استخدام حقول تبويب آخر.
                    <div key="delegates-panel">
                        <h2
                            style={{
                                margin: 0,
                                marginBottom: 20,
                                color: "#17365d",
                                fontSize: 17,
                            }}
                        >
                            بيانات المندوب
                        </h2>

                        {/* نموذج تسجيل بيانات المندوب */}
                        <form
                            onSubmit={saveDelegate}
                            onChange={() => {
                                delegateRequestKey.current = null;
                                setDelegateMessage(null);
                            }}
                            style={{ display: "grid", gap: 20 }}
                        >
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                                    gap: 16,
                                }}
                            >
                                {[
                                    ["fullName", "الاسم الرباعي", "أدخل الاسم الرباعي", 255],
                                    ["nationalNumber", "الرقم الوطني", "أدخل الرقم الوطني", 30],
                                    ["employeeNumber", "الرقم الوظيفي", "أدخل الرقم الوظيفي", 50],
                                    ["academicQualification", "المؤهل العلمي", "أدخل المؤهل العلمي", 255],
                                    ["actualServiceYears", "سنوات الخدمة الفعلية", "أدخل عدد السنوات", 2],
                                    ["phoneNumber", "رقم الهاتف", "أدخل رقم الهاتف", 30],
                                    ["originalWorkplace", "جهة العمل الأصلية", "أدخل جهة العمل الأصلية", 255],
                                ].map(([field, label, placeholder, maxLength]) => (
                                    <label
                                        key={field}
                                        style={{ display: "grid", gap: 8, color: "#334155", fontSize: 13 }}
                                    >
                                        <span style={{ fontWeight: 600 }}>{label} *</span>
                                        <input
                                            type={field === "actualServiceYears" ? "number" : "text"}
                                            name={String(field)}
                                            placeholder={String(placeholder)}
                                            maxLength={field === "actualServiceYears" ? undefined : Number(maxLength)}
                                            min={field === "actualServiceYears" ? 0 : undefined}
                                            max={field === "actualServiceYears" ? 80 : undefined}
                                            step={field === "actualServiceYears" ? 1 : undefined}
                                            required
                                            style={{
                                                padding: "11px 14px",
                                                border: "1px solid #cbd5e1",
                                                borderRadius: 8,
                                                fontSize: 13,
                                                width: "100%",
                                                minWidth: 0,
                                            }}
                                        />
                                    </label>
                                ))}

                                {/* حقل اجتياز الدورة التأهيلية */}
                                <fieldset
                                    style={{
                                        border: "none",
                                        padding: 0,
                                        margin: 0,
                                        display: "grid",
                                        alignContent: "start",
                                        gap: 12,
                                    }}
                                >
                                    <legend
                                        style={{
                                            color: "#334155",
                                            fontSize: 13,
                                            fontWeight: 600,
                                            marginBottom: 12,
                                        }}
                                    >
                                        اجتياز الدورة التأهيلية *
                                    </legend>

                                    <div style={{ display: "flex", gap: 24 }}>
                                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <input type="radio" name="passedQualificationCourse" value="yes" required />
                                            نعم
                                        </label>

                                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <input type="radio" name="passedQualificationCourse" value="no" required />
                                            لا
                                        </label>
                                    </div>
                                </fieldset>
                            </div>

                            {/* الملاحظات الاختيارية */}
                            <label
                                style={{
                                    display: "grid",
                                    gap: 8,
                                    color: "#334155",
                                    fontSize: 13,
                                    fontWeight: 600,
                                }}
                            >
                                ملاحظات (اختياري)
                                <textarea
                                    rows={3}
                                    name="notes"
                                    maxLength={2000}
                                    placeholder="أدخل أي ملاحظات إضافية..."
                                    style={{
                                        padding: "11px 14px",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        resize: "vertical",
                                        width: "100%",
                                    }}
                                />
                            </label>

                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <button
                                    type="submit"
                                    disabled={savingDelegate}
                                    style={{
                                        padding: "11px 24px",
                                        background: "#17365d",
                                        color: "#ffffff",
                                        border: 0,
                                        borderRadius: 8,
                                        fontWeight: 700,
                                        cursor: savingDelegate ? "wait" : "pointer",
                                        opacity: savingDelegate ? 0.7 : 1,
                                    }}
                                >
                                    {savingDelegate ? "جارٍ حفظ البيانات..." : "حفظ بيانات المندوب"}
                                </button>
                            </div>

                            {delegateMessage && (
                                <div
                                    role={delegateMessage.success ? "status" : "alert"}
                                    style={{
                                        padding: "12px 16px",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        background: delegateMessage.success ? "#f0fdf4" : "#fef2f2",
                                        border: delegateMessage.success ? "1px solid #86efac" : "1px solid #fecaca",
                                        color: delegateMessage.success ? "#166534" : "#991b1b",
                                    }}
                                >
                                    {delegateMessage.text}
                                </div>
                            )}
                        </form>

                        {/* قسم البحث عن المندوبين */}
                        <section style={{ marginTop: 32 }}>
                            <h2
                                style={{
                                    color: "#17365d",
                                    fontSize: 17,
                                    marginBottom: 12,
                                }}
                            >
                                البحث عن المندوبين
                            </h2>

                            <div
                                style={{
                                    padding: 16,
                                    background: "#f8fafc",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 12,
                                }}
                            >
                                {/* حقل بحث مرتبط بحالة React بقيمة نصية ثابتة */}
                                <input
                                    type="search"
                                    placeholder="ابحث باسم المندوب أو الرقم الوطني أو الوظيفي..."
                                    aria-label="البحث عن المندوبين"
                                    value={delegateSearch ?? ""}
                                    onChange={(event) => {
                                        // نضمن تخزين قيمة نصية فقط في حالة البحث.
                                        setDelegateSearch(event.currentTarget.value ?? "");
                                    }}
                                    style={{
                                        width: "100%",
                                        padding: "11px 14px",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: 8,
                                        fontSize: 13,
                                    }}
                                />
                            </div>
                        </section>

                        {/* جدول المندوبين المسجلين */}
                        <section style={{ marginTop: 28 }}>
                            <h2
                                style={{
                                    color: "#17365d",
                                    fontSize: 17,
                                    marginBottom: 12,
                                }}
                            >
                                المندوبون المسجلون
                            </h2>

                            <div
                                style={{
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 12,
                                    overflowX: "auto",
                                }}
                            >
                                <table
                                    style={{
                                        width: "100%",
                                        minWidth: 800,
                                        borderCollapse: "collapse",
                                        textAlign: "right",
                                    }}
                                >
                                    <thead style={{ background: "#f1f5f9" }}>
                                        <tr>
                                            {[
                                                "م",
                                                "الاسم الرباعي",
                                                "الرقم الوطني",
                                                "الرقم الوظيفي",
                                                "المؤهل العلمي",
                                                "سنوات الخدمة",
                                                "جهة العمل الأصلية",
                                                "رقم الهاتف",
                                                "الإجراءات",
                                            ].map((heading) => (
                                                <th
                                                    key={heading}
                                                    scope="col"
                                                    style={{
                                                        padding: 16,
                                                        color: "#334155",
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    {heading}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {/* عرض حالة تحميل بيانات المندوبين من الخادم */}
                                        {loadingDelegates ? (
                                            <tr>
                                                <td
                                                    colSpan={9}
                                                    style={{
                                                        padding: 28,
                                                        textAlign: "center",
                                                        color: "#64748b",
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    جارٍ تحميل بيانات المندوبين...
                                                </td>
                                            </tr>
                                        ) : delegatesError ? (
                                            /* عرض رسالة الخطأ دون إظهار بيانات قديمة أو غير مكتملة */
                                            <tr>
                                                <td
                                                    colSpan={9}
                                                    role="alert"
                                                    style={{
                                                        padding: 28,
                                                        textAlign: "center",
                                                        color: "#b91c1c",
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    {delegatesError}
                                                </td>
                                            </tr>
                                        ) : delegates.length === 0 ? (
                                            /* التمييز بين عدم وجود سجلات وعدم وجود نتائج مطابقة للبحث */
                                            <tr>
                                                <td
                                                    colSpan={9}
                                                    style={{
                                                        padding: 28,
                                                        textAlign: "center",
                                                        color: "#64748b",
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    {delegateSearch.trim()
                                                        ? "لا توجد نتائج مطابقة لعبارة البحث."
                                                        : "لا يوجد مندوبون مسجلون حاليًا."}
                                                </td>
                                            </tr>
                                        ) : (
                                            /* إنشاء صف لكل مندوب اعتمادًا على البيانات المسترجعة من PostgreSQL */
                                            delegates.map((delegate, index) => (
                                                <tr
                                                    key={delegate.id}
                                                    style={{
                                                        borderTop: "1px solid #e2e8f0",
                                                    }}
                                                >
                                                    <td style={{ padding: 14 }}>{index + 1}</td>
                                                    <td style={{ padding: 14 }}>{delegate.full_name}</td>
                                                    <td style={{ padding: 14 }}>{delegate.national_number}</td>
                                                    <td style={{ padding: 14 }}>{delegate.employee_number}</td>
                                                    <td style={{ padding: 14 }}>{delegate.academic_qualification}</td>
                                                    <td style={{ padding: 14 }}>{delegate.actual_service_years}</td>
                                                    <td style={{ padding: 14 }}>{delegate.original_workplace}</td>
                                                    <td style={{ padding: 14 }}>{delegate.phone_number}</td>
                                                    <td
                                                        style={{
                                                            padding: 14,
                                                            color: "#94a3b8",
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        {/* إجراءات التعديل والعرض ستُضاف بعد اعتماد صلاحياتها */}
                                                        —
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                ) : (
                    // فصل عناصر التكليفات عن عناصر تسجيل المندوبين.
                    <div key="assignments-panel">
                        {/* عنوان نموذج التكليف */}
                        <h2
                            style={{
                                margin: 0,
                                marginBottom: 20,
                                color: "#17365d",
                                fontSize: 17,
                            }}
                        >
                            بيانات تكليف المندوب
                        </h2>

                        {/* نموذج تسجيل تكليف جديد */}
                        <form
                            onSubmit={saveAssignment}
                            onChange={() => {
                                // نحتفظ بمفتاح الطلب وبياناته عند تعديل النموذج.
                                // دالة الحفظ تقارن البيانات الجديدة بالطلب السابق:
                                // إذا تطابقت تستخدم المفتاح نفسه، وإلا تنشئ مفتاحًا جديدًا.
                                if (!assignmentSavingLock.current) {
                                    setAssignmentMessage(null);
                                }
                            }}
                            style={{ display: "grid", gap: 20 }}
                        >
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                                    gap: 16,
                                }}
                            >
                                {/* اختيار المندوب */}
                                <label style={{ display: "grid", gap: 8, fontSize: 13, color: "#334155" }}>
                                    <span style={{ fontWeight: 600 }}>اسم المندوب *</span>
                                    <select
                                        name="delegateId"
                                        required
                                        defaultValue=""
                                        disabled={savingAssignment || loadingAssignmentDelegates}
                                        style={{
                                            padding: "11px 14px",
                                            border: "1px solid #cbd5e1",
                                            borderRadius: 8,
                                            background: "#ffffff",
                                            fontSize: 13,
                                        }}
                                    >
                                        {/* عرض المندوبين المسجلين في قاعدة البيانات */}
                                        <option value="" disabled>
                                            {loadingAssignmentDelegates
                                                ? "جارٍ تحميل المندوبين..."
                                                : "اختر مندوبًا مسجلًا"}
                                        </option>

                                        {/* استخدام المعرّف الفريد للمندوب بدل اسمه عند حفظ التكليف */}
                                        {assignmentDelegates.map((delegate) => (
                                            <option key={delegate.id} value={delegate.id}>
                                                {delegate.full_name}
                                            </option>
                                        ))}
                                    </select>

                                    {/* عرض أخطاء تحميل قائمة المندوبين بصورة مستقلة */}
                                    {assignmentDelegatesError && (
                                        <span role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                                            {assignmentDelegatesError}
                                        </span>
                                    )}
                                </label>

                                {/* اختيار الجهة الإدارية */}
                                <label style={{ display: "grid", gap: 8, fontSize: 13, color: "#334155" }}>
                                    <span style={{ fontWeight: 600 }}>
                                        الجهة الإدارية المكلّف بها *
                                    </span>
                                    <select
                                        name="administrativeEntityId"
                                        required
                                        defaultValue=""
                                        disabled={savingAssignment || loadingEligibleEntities}
                                        style={{
                                            padding: "11px 14px",
                                            border: "1px solid #cbd5e1",
                                            borderRadius: 8,
                                            background: "#ffffff",
                                            fontSize: 13,
                                        }}
                                    >
                                        {/* عرض حالة تحميل الجهات الإدارية المؤهلة */}
                                        <option value="" disabled>
                                            {loadingEligibleEntities
                                                ? "جارٍ تحميل الجهات الإدارية..."
                                                : "اختر جهة ذات ذمة مالية مستقلة"}
                                        </option>

                                        {/* عرض الجهات المؤهلة المسترجعة من قاعدة البيانات */}
                                        {eligibleEntities.map((entity) => (
                                            <option key={entity.id} value={entity.id}>
                                                {entity.name}
                                            </option>
                                        ))}
                                    </select>

                                    {/* عرض أخطاء تحميل الجهات خارج قائمة الاختيار */}
                                    {eligibleEntitiesError && (
                                        <span role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                                            {eligibleEntitiesError}
                                        </span>
                                    )}
                                </label>

                                {/* الرقم الإشاري */}
                                <label style={{ display: "grid", gap: 8, fontSize: 13, color: "#334155" }}>
                                    <span style={{ fontWeight: 600 }}>
                                        الرقم الإشاري لرسالة التكليف *
                                    </span>
                                    <input
                                        type="text"
                                        name="assignmentReference"
                                        required
                                        maxLength={150}
                                        disabled={savingAssignment}
                                        placeholder="أدخل الرقم الإشاري"
                                        style={{
                                            padding: "11px 14px",
                                            border: "1px solid #cbd5e1",
                                            borderRadius: 8,
                                            fontSize: 13,
                                        }}
                                    />
                                </label>

                                {/* تاريخ رسالة التكليف */}
                                <label style={{ display: "grid", gap: 8, fontSize: 13, color: "#334155" }}>
                                    <span style={{ fontWeight: 600 }}>
                                        تاريخ رسالة التكليف *
                                    </span>
                                    <input
                                        type="date"
                                        name="assignmentDate"
                                        required
                                        min="1900-01-01"
                                        max="2100-12-31"
                                        disabled={savingAssignment}
                                        style={{
                                            padding: "11px 14px",
                                            border: "1px solid #cbd5e1",
                                            borderRadius: 8,
                                            fontSize: 13,
                                        }}
                                    />
                                </label>
                            </div>

                            {/* حالة التكليف التلقائية */}
                            <div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: "#334155",
                                        marginBottom: 8,
                                    }}
                                >
                                    حالة التكليف
                                </div>
                                <div
                                    style={{
                                        background: "#eff6ff",
                                        border: "1px solid #bfdbfe",
                                        color: "#1e40af",
                                        borderRadius: 8,
                                        padding: 14,
                                        fontSize: 13,
                                    }}
                                >
                                    تُحدد حالة التكليف تلقائيًا: ساري أو منتهٍ، دون تدخل يدوي.
                                </div>
                            </div>

                            {/* ملاحظات التكليف */}
                            <label
                                style={{
                                    display: "grid",
                                    gap: 8,
                                    color: "#334155",
                                    fontSize: 13,
                                    fontWeight: 600,
                                }}
                            >
                                ملاحظات (اختياري)
                                <textarea
                                    name="assignmentNotes"
                                    rows={3}
                                    maxLength={2000}
                                    disabled={savingAssignment}
                                    placeholder="ملاحظات التكليف..."
                                    style={{
                                        padding: "11px 14px",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        resize: "vertical",
                                        width: "100%",
                                    }}
                                />
                            </label>

                            {/* قواعد التكليف المعتمدة */}
                            <div
                                style={{
                                    padding: 16,
                                    background: "#fff7ed",
                                    border: "1px solid #fed7aa",
                                    borderRadius: 10,
                                }}
                            >
                                <strong style={{ color: "#9a3412", fontSize: 13 }}>
                                    قواعد التكليف المعتمدة
                                </strong>
                                <p style={{ color: "#9a3412", fontSize: 13, lineHeight: 1.9, marginBottom: 0 }}>
                                    لا يجوز تكليف مندوب بجهة ليس لديها ذمة مالية مستقلة.
                                    وعند تسجيل تكليف جديد للجهة نفسها، ينتهي التكليف السابق
                                    تلقائيًا مع الاحتفاظ بسجله.
                                </p>
                            </div>

                            {/* زر حفظ التكليف وعرض نتيجة العملية */}
                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <button
                                    type="submit"
                                    disabled={
                                        savingAssignment ||
                                        loadingAssignmentDelegates ||
                                        loadingEligibleEntities ||
                                        Boolean(assignmentDelegatesError) ||
                                        Boolean(eligibleEntitiesError)
                                    }
                                    style={{
                                        padding: "11px 24px",
                                        background: "#17365d",
                                        color: "#ffffff",
                                        border: 0,
                                        borderRadius: 8,
                                        fontWeight: 700,
                                        cursor: savingAssignment ? "wait" : "pointer",
                                        opacity: savingAssignment ? 0.7 : 1,
                                    }}
                                >
                                    {savingAssignment
                                        ? "جارٍ حفظ التكليف..."
                                        : "حفظ التكليف"}
                                </button>
                            </div>

                            {/* رسالة نجاح أو فشل حفظ التكليف */}
                            {assignmentMessage && (
                                <div
                                    role={assignmentMessage.success ? "status" : "alert"}
                                    style={{
                                        padding: "12px 16px",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        background: assignmentMessage.success
                                            ? "#f0fdf4"
                                            : "#fef2f2",
                                        border: assignmentMessage.success
                                            ? "1px solid #86efac"
                                            : "1px solid #fecaca",
                                        color: assignmentMessage.success
                                            ? "#166534"
                                            : "#991b1b",
                                    }}
                                >
                                    {assignmentMessage.text}
                                </div>
                            )}
                        </form>

                        {/* البحث وتصفية التكليفات */}
                        <section style={{ marginTop: 32 }}>
                            <h2 style={{ color: "#17365d", fontSize: 17, marginBottom: 12 }}>
                                البحث وتصفية التكليفات
                            </h2>

                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 12,
                                    padding: 16,
                                    background: "#f8fafc",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 12,
                                }}
                            >
                                <input
                                    type="search"
                                    value={assignmentSearch}
                                    onChange={(event) => {
                                        setAssignmentsPage(1);
                                        setAssignmentSearch(event.target.value);
                                    }}
                                    placeholder="ابحث باسم المندوب أو الجهة الإدارية..."
                                    aria-label="البحث في تكليفات المندوبين"
                                    maxLength={150}
                                    style={{
                                        flex: "2 1 260px",
                                        minWidth: 220,
                                        padding: "11px 14px",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        background: "#ffffff",
                                        color: "#0f172a",
                                    }}
                                />

                                <select
                                    value={assignmentStatusFilter}
                                    onChange={(event) => {
                                        setAssignmentsPage(1);
                                        setAssignmentStatusFilter(
                                            event.target.value as "all" | "active" | "ended"
                                        );
                                    }}
                                    aria-label="تصفية حسب حالة التكليف"
                                    style={{
                                        flex: "1 1 180px",
                                        minWidth: 160,
                                        padding: "11px 14px",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        background: "#ffffff",
                                        color: "#0f172a",
                                    }}
                                >
                                    <option value="all">جميع التكليفات</option>
                                    <option value="active">ساري</option>
                                    <option value="ended">منتهٍ</option>
                                </select>
                            </div>
                        </section>

                        {/* جدول التكليفات المسجلة */}
                        <section style={{ marginTop: 28 }}>
                            <h2 style={{ color: "#17365d", fontSize: 17, marginBottom: 12 }}>
                                التكليفات المسجلة
                            </h2>

                            <div
                                style={{
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 12,
                                    overflowX: "auto",
                                }}
                            >
                                <table
                                    style={{
                                        width: "100%",
                                        minWidth: 850,
                                        borderCollapse: "collapse",
                                        textAlign: "right",
                                    }}
                                >
                                    <thead style={{ background: "#f1f5f9" }}>
                                        <tr>
                                            {[
                                                "م",
                                                "اسم المندوب",
                                                "الجهة الإدارية",
                                                "حالة التكليف",
                                                "الرقم الإشاري لرسالة التكليف",
                                                "تاريخ رسالة التكليف",
                                                "ملاحظات",
                                                "الإجراءات",
                                            ].map((heading) => (
                                                <th
                                                    key={heading}
                                                    scope="col"
                                                    style={{
                                                        padding: 16,
                                                        color: "#334155",
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    {heading}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingAssignments ? (
                                            <tr>
                                                <td
                                                    colSpan={8}
                                                    style={{
                                                        padding: 28,
                                                        textAlign: "center",
                                                        color: "#64748b",
                                                    }}
                                                >
                                                    جارٍ تحميل التكليفات المسجلة...
                                                </td>
                                            </tr>
                                        ) : assignmentsError ? (
                                            <tr>
                                                <td
                                                    colSpan={8}
                                                    style={{
                                                        padding: 28,
                                                        textAlign: "center",
                                                        color: "#b91c1c",
                                                    }}
                                                >
                                                    {assignmentsError}
                                                </td>
                                            </tr>
                                        ) : filteredAssignments.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={8}
                                                    style={{
                                                        padding: 28,
                                                        textAlign: "center",
                                                        color: "#64748b",
                                                    }}
                                                >
                                                    {assignments.length === 0
                                                        ? "لا توجد تكليفات مسجلة حاليًا."
                                                        : "لا توجد تكليفات مطابقة لمعايير البحث والتصفية."}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredAssignments.map((assignment, index) => (
                                                <tr
                                                    key={assignment.id}
                                                    style={{
                                                        borderTop: "1px solid #e2e8f0",
                                                    }}
                                                >
                                                    <td style={{ padding: 12 }}>
                                                        {index + 1}
                                                    </td>

                                                    <td style={{ padding: 12 }}>
                                                        {assignment.delegate_name}
                                                    </td>

                                                    <td style={{ padding: 12 }}>
                                                        {assignment.administrative_entity_name}
                                                    </td>

                                                    <td style={{ padding: 12 }}>
                                                        <span
                                                            style={{
                                                                display: "inline-block",
                                                                padding: "5px 10px",
                                                                borderRadius: 999,
                                                                fontSize: 12,
                                                                fontWeight: 600,
                                                                background:
                                                                    assignment.status === "ساري"
                                                                        ? "#dcfce7"
                                                                        : "#ffd0d0",
                                                                color:
                                                                    assignment.status === "ساري"
                                                                        ? "#166534"
                                                                        : "#ff0000",
                                                            }}
                                                        >
                                                            {assignment.status}
                                                        </span>
                                                    </td>

                                                    <td style={{ padding: 12 }}>
                                                        {assignment.assignment_reference}
                                                    </td>

                                                    <td
                                                        dir="ltr"
                                                        style={{
                                                            padding: 12,
                                                            textAlign: "right",
                                                        }}
                                                    >
                                                        {assignment.assignment_date}
                                                    </td>

                                                    <td style={{ padding: 12 }}>
                                                        {assignment.notes?.trim() || "—"}
                                                    </td>

                                                    <td style={{ padding: 12 }}>
                                                        <span
                                                            style={{
                                                                color: "#64748b",
                                                                fontSize: 12,
                                                            }}
                                                        >
                                                            لا توجد إجراءات حاليًا
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* التنقل بين صفحات التكليفات المسجلة */}
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    gap: 12,
                                    marginTop: 16,
                                    padding: "12px 16px",
                                    background: "#f8fafc",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 10,
                                }}
                            >
                                <span
                                    style={{
                                        color: "#475569",
                                        fontSize: 13,
                                    }}
                                >
                                    إجمالي التكليفات المطابقة:{" "}
                                    <strong>{assignmentsTotal}</strong>
                                </span>

                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAssignmentsPage((previous) =>
                                                Math.max(1, previous - 1)
                                            );
                                        }}
                                        disabled={loadingAssignments || assignmentsPage <= 1}
                                        style={{
                                            padding: "8px 14px",
                                            border: "1px solid #cbd5e1",
                                            borderRadius: 8,
                                            background: "#ffffff",
                                            color: "#0f172a",
                                            cursor:
                                                loadingAssignments || assignmentsPage <= 1
                                                    ? "not-allowed"
                                                    : "pointer",
                                            opacity:
                                                loadingAssignments || assignmentsPage <= 1
                                                    ? 0.5
                                                    : 1,
                                        }}
                                    >
                                        السابق
                                    </button>

                                    <span
                                        style={{
                                            fontSize: 13,
                                            color: "#334155",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        الصفحة {assignmentsPage} من{" "}
                                        {Math.max(1, assignmentsTotalPages)}
                                    </span>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAssignmentsPage((previous) =>
                                                Math.min(assignmentsTotalPages, previous + 1)
                                            );
                                        }}
                                        disabled={
                                            loadingAssignments ||
                                            assignmentsTotalPages === 0 ||
                                            assignmentsPage >= assignmentsTotalPages
                                        }
                                        style={{
                                            padding: "8px 14px",
                                            border: "1px solid #cbd5e1",
                                            borderRadius: 8,
                                            background: "#ffffff",
                                            color: "#0f172a",
                                            cursor:
                                                loadingAssignments ||
                                                    assignmentsTotalPages === 0 ||
                                                    assignmentsPage >= assignmentsTotalPages
                                                    ? "not-allowed"
                                                    : "pointer",
                                            opacity:
                                                loadingAssignments ||
                                                    assignmentsTotalPages === 0 ||
                                                    assignmentsPage >= assignmentsTotalPages
                                                    ? 0.5
                                                    : 1,
                                        }}
                                    >
                                        التالي
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>

                )}
            </div>
        </section>
    );
}
