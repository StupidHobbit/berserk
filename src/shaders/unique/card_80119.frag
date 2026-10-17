#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Дейла: a beckoning current meets the lowered fingertip; a second wake
// repeats its direction beside her submerged arm. Top-left scan coordinates.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.45,1.0,length((p-c)/r));
}
vec2 lurePath(float s) {
    vec2 a=vec2(0.143,0.411);
    vec2 b=vec2(0.112,0.474);
    vec2 c=vec2(0.257,0.455);
    return mix(mix(a,b,s),mix(b,c,s),s);
}
float ringWake(vec2 p, vec2 center, float phase, float aa) {
    vec2 q=(p-center)*vec2(1.0,3.8);
    float r=length(q);
    float result=0.0;
    for (int i=0;i<3;i++) {
        float age=fract(phase+float(i)/3.0);
        float radius=0.018+age*0.145;
        float fade=smoothstep(0.0,0.13,age)*(1.0-smoothstep(0.54,1.0,age));
        float wave=1.0-smoothstep(0.0015,0.0035+aa*1.6,abs(r-radius));
        // The broken far bank of a ring remains visible behind its bright lip.
        float broken=0.68+0.32*sin(q.x*58.0+q.y*35.0+phase*6.2831853);
        result+=wave*fade*broken;
    }
    return result;
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1731)*6.2831853;
    float art=smoothstep(0.143,0.158,p.y)*(1.0-smoothstep(0.545,0.559,p.y));
    art*=smoothstep(0.014,0.034,p.x)*(1.0-smoothstep(0.967,0.989,p.x));
    // The overprinted shield and lower lotus/stat frame are never animated.
    art*=smoothstep(1.0,1.19,length((p-vec2(0.109,0.179))/vec2(0.062,0.044)));
    art*=1.0-oval(p,vec2(0.251,0.554),vec2(0.106,0.047));
    if (art<=0.0) {
        gl_FragColor=scan;
        return;
    }
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float face=oval(p,vec2(0.416,0.319),vec2(0.074,0.053));
    float torso=oval(p,vec2(0.547,0.428),vec2(0.155,0.073));
    float arm=oval(p,vec2(0.681,0.452),vec2(0.062,0.064));
    float hand=oval(p,vec2(0.302,0.431),vec2(0.053,0.036));
    float flesh=clamp(face+torso+arm+hand,0.0,1.0);

    // Refraction only in the foreground river. Its small displacement follows
    // the painted water and dies before the figure, plants and all print.
    float water=smoothstep(0.452,0.490,p.y)*(1.0-smoothstep(0.542,0.558,p.y));
    water*=smoothstep(0.025,0.16,min(scan.g,scan.b)-scan.r*0.65);
    water*=1.0-flesh;
    float sway=sin(t*0.82+seed);
    vec2 displacement=vec2(sin(p.y*109.0-t*1.45+seed)*0.0025,
                           sin(p.x*46.0+t*1.16+seed)*0.0010)*water*art;
    vec2 wetUV=v_uv+displacement*vec2(1.0,-1.0);
    vec3 wet=texture2D(u_card,wetUV).rgb;
    color=mix(color,wet,water*0.78);
    float caustic=pow(0.5+0.5*sin(p.y*145.0+sin(p.x*35.0-t*0.8)*1.6-t*1.5),9.0);
    color+=(1.0-color)*vec3(0.035,0.18,0.17)*water*caustic;

    // Both wakes move the same way, with the smaller answering ring delayed
    // by one beat: the movement-following ability appears in the river itself.
    vec2 drift=vec2(0.024*sway,0.0025*sin(t*0.82+seed));
    float wake=ringWake(p,vec2(0.258,0.498)+drift,t*0.19+seed*0.07,aa);
    float answer=ringWake(p,vec2(0.663,0.523)+drift,t*0.19+seed*0.07-0.14,aa);
    float river=smoothstep(0.470,0.490,p.y)*(1.0-flesh);
    color+=vec3(0.13,0.44,0.43)*(wake*0.62+answer*0.42)*river;

    // A pink-gold invitation travels from the tiny floating blossom towards
    // her fingertip along a curved strand, leaving the face clearly painted.
    float thread=0.0;
    float mist=0.0;
    float head=fract(t*0.215+seed*0.09);
    for (int i=0;i<24;i++) {
        float s=float(i)/24.0;
        vec2 a=lurePath(s);
        vec2 b=lurePath(s+1.0/24.0);
        a.x+=sin(s*3.14159265)*0.008*sway;
        b.x+=sin((s+1.0/24.0)*3.14159265)*0.008*sway;
        vec2 ab=(b-a)*vec2(1.0,1.4113);
        vec2 ap=(p-a)*vec2(1.0,1.4113);
        float f=clamp(dot(ap,ab)/max(dot(ab,ab),0.000001),0.0,1.0);
        float d=length(ap-ab*f);
        float position=s+f/24.0;
        float delta=fract(position-head+0.5)-0.5;
        float packet=exp(-delta*delta/0.007);
        float ends=smoothstep(0.0,0.08,position)*(1.0-smoothstep(0.96,1.0,position));
        thread=max(thread,(1.0-smoothstep(0.0008,0.0018+aa,d))*(0.12+packet*0.8)*ends);
        mist=max(mist,exp(-d*d/0.00012)*packet*ends);
    }
    color+=vec3(0.49,0.24,0.23)*thread+vec3(0.09,0.025,0.035)*mist;
    float fingertip=oval(p,vec2(0.257,0.454),vec2(0.022,0.014));
    float beckon=pow(0.5+0.5*sin(t*1.35+seed),3.0);
    color+=(1.0-color)*vec3(0.30,0.34,0.20)*fingertip*(0.2+0.8*beckon);

    // Her flower crown answers the lure, while cyan strands on the trailing
    // wet hair carry the same lateral rhythm as the two wakes.
    float crown=oval(p,vec2(0.425,0.221),vec2(0.143,0.080));
    float petals=crown*smoothstep(0.04,0.28,scan.r-scan.g*0.80)*smoothstep(0.32,0.71,lum);
    color+=(1.0-color)*vec3(0.27,0.07,0.15)*petals*(0.16+0.42*beckon);
    float hair=oval(p,vec2(0.771,0.420),vec2(0.164,0.080))*(1.0-flesh);
    float cyan=smoothstep(0.03,0.22,min(scan.g,scan.b)-scan.r);
    color+=vec3(0.02,0.13,0.16)*hair*cyan*(0.35+0.65*sin(p.x*22.0-t*0.82+seed)*sin(p.x*22.0-t*0.82+seed));

    if (u_is_foil) {
        // Pearl petals, wet reflected light and the narrow trident edges get
        // a distinct metallic finish, with dark/light facets and rainbow glints.
        float trident=oval(p,vec2(0.660,0.257),vec2(0.065,0.116))*cyan;
        float metal=clamp(petals*0.85+trident*1.2+water*smoothstep(0.40,0.80,lum)*0.65+hair*cyan*0.35,0.0,1.0);
        float phase=p.x*3.4+p.y*5.1-t*0.19+seed*0.12;
        vec3 rainbow=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float sheen=pow(0.5+0.5*sin(phase*6.2831853),13.0);
        color*=1.0-metal*(0.07+0.11*(1.0-sheen));
        color+=(1.0-color)*mix(vec3(0.75,0.95,0.95),rainbow,0.59)*metal*(0.20+0.90*sheen);
        // Low-strength foil substrate remains recognizable at compact size;
        // the card-specific metallic details above keep their stronger highlights.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.25);

    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
